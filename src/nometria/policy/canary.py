"""Agent canary rollout by version, with health gates and automated rollback (P12-6).

A canary sits on top of the current binding rather than replacing it outright: the
binding still points at the *stable* version everyone keeps getting, while a
percentage of requests are routed to a *candidate* version instead. The percentage
climbs through an explicit ladder (``steps``) each time :func:`canary_rollout` is
called and finds the candidate cohort healthy; it snaps back to zero — and the
candidate is abandoned — the moment the candidate's block rate runs meaningfully
ahead of the stable cohort's. Rollback is "automated" in the sense that matters for
an operator: given a canary in flight, calling this once decides advance-or-revert
from telemetry alone, with no judgement call left to make. Nothing here runs on a
timer — the platform has no scheduler to hang one off — so a caller (the dashboard's
"check health" action, a cron, a CI step) drives the cadence; the function itself is
idempotent and safe to call as often or as rarely as that caller likes.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Decision, Policy, PolicyBinding, PolicyCanary, PolicyVersion, utcnow

DEFAULT_STEPS = [10, 25, 50, 100]


class CanaryError(ValueError):
    pass


def active_canary(session: Session, policy_id: str) -> PolicyCanary | None:
    return session.scalar(
        select(PolicyCanary).where(
            PolicyCanary.policy_id == policy_id, PolicyCanary.status == "rolling"
        )
    )


def pick_version_id(canary: PolicyCanary) -> str:
    """Which version this one request should be evaluated against.

    Per-request, not per-agent or per-session: a plain percentage rollout does not
    need sticky assignment to be statistically valid, and per-request keeps the
    implementation honest — no hash key to get wrong, no cohort-drift bug from
    reusing a stale assignment after the percent has moved.
    """
    if canary.percent >= 100:
        return canary.candidate_version_id
    if canary.percent <= 0:
        return canary.stable_version_id
    return (
        canary.candidate_version_id
        if random.random() * 100 < canary.percent
        else canary.stable_version_id
    )


def _current_binding(session: Session, version_id: str) -> PolicyBinding | None:
    return session.scalar(
        select(PolicyBinding).where(
            PolicyBinding.policy_version_id == version_id,
            PolicyBinding.effective_to.is_(None),
        )
    )


def start_canary(
    session: Session,
    policy_key: str,
    candidate_version: int | None = None,
    steps: list[int] | None = None,
    max_block_rate_delta: float = 0.15,
    min_sample: int = 20,
    started_by: str | None = None,
) -> PolicyCanary:
    """Begin rolling a candidate version out against the version that precedes it.

    ``candidate_version`` is a version *number* (the one shown in the UI and
    ``history()``), defaulting to the latest. Every save auto-binds the new version
    it creates (there is no separate "draft" state), so by the time this is called
    the candidate is typically already the live binding at 100% — that save is what
    prompted wanting a canary in the first place. This pulls the binding back to
    whatever was live immediately before the candidate, so the canary, not the save,
    now controls how much traffic the candidate actually sees.
    """
    policy = session.scalar(select(Policy).where(Policy.key == policy_key))
    if policy is None:
        raise CanaryError(f"unknown policy '{policy_key}'")
    if active_canary(session, policy.id) is not None:
        raise CanaryError(f"policy '{policy_key}' already has a canary rolling")

    versions = list(
        session.scalars(
            select(PolicyVersion)
            .where(PolicyVersion.policy_id == policy.id)
            .order_by(PolicyVersion.version.desc())
        )
    )
    if not versions:
        raise CanaryError(f"policy '{policy_key}' has no versions to canary")
    candidate = (
        next((v for v in versions if v.version == candidate_version), None)
        if candidate_version is not None
        else versions[0]
    )
    if candidate is None:
        raise CanaryError(f"policy '{policy_key}' has no version {candidate_version}")

    current_bound = None
    for v in versions:
        if _current_binding(session, v.id) is not None:
            current_bound = v
            break
    if current_bound is None:
        raise CanaryError(f"policy '{policy_key}' has no active binding to canary against")

    if current_bound.id != candidate.id:
        stable = current_bound
    else:
        # The candidate is already live — find what it replaced and pull the
        # binding back there before the canary starts ramping traffic up again.
        other_ids = [v.id for v in versions if v.id != candidate.id]
        prior_binding = session.scalar(
            select(PolicyBinding)
            .where(PolicyBinding.policy_version_id.in_(other_ids))
            .order_by(PolicyBinding.effective_to.desc())
        )
        if prior_binding is None:
            raise CanaryError(
                "candidate is already the live version and there is no earlier "
                "version to canary it against"
            )
        stable = session.get(PolicyVersion, prior_binding.policy_version_id)
        assert stable is not None
        open_binding = _current_binding(session, candidate.id)
        assert open_binding is not None
        session.add(
            PolicyBinding(
                policy_version_id=stable.id,
                scope_json=open_binding.scope_json,
                mode=open_binding.mode,
                level=open_binding.level,
                scope_id=open_binding.scope_id,
                compose=open_binding.compose,
            )
        )
        open_binding.effective_to = utcnow()
        session.flush()

    ladder = list(steps) if steps else list(DEFAULT_STEPS)
    if not ladder or ladder[-1] != 100:
        ladder = [*ladder, 100]
    ladder = sorted(set(p for p in ladder if 0 < p <= 100))

    canary = PolicyCanary(
        policy_id=policy.id,
        stable_version_id=stable.id,
        candidate_version_id=candidate.id,
        steps=ladder,
        step_index=0,
        percent=ladder[0],
        status="rolling",
        max_block_rate_delta=max_block_rate_delta,
        min_sample=min_sample,
        started_by=started_by,
    )
    session.add(canary)
    session.flush()
    return canary


@dataclass
class CohortHealth:
    version_id: str
    decisions: int
    blocked: int

    @property
    def block_rate(self) -> float | None:
        return (self.blocked / self.decisions) if self.decisions else None


def _cohort_health(session: Session, canary: PolicyCanary, version_id: str) -> CohortHealth:
    rows = session.execute(
        select(Decision.verdict).where(
            Decision.policy_version_id == version_id,
            Decision.created_at >= canary.created_at,
        )
    ).all()
    decisions = len(rows)
    blocked = sum(1 for (verdict,) in rows if verdict in ("block", "escalate"))
    return CohortHealth(version_id=version_id, decisions=decisions, blocked=blocked)


def canary_health(session: Session, canary: PolicyCanary) -> dict:
    stable = _cohort_health(session, canary, canary.stable_version_id)
    candidate = _cohort_health(session, canary, canary.candidate_version_id)
    delta = None
    if stable.block_rate is not None and candidate.block_rate is not None:
        delta = candidate.block_rate - stable.block_rate
    return {
        "stable": {"decisions": stable.decisions, "block_rate": stable.block_rate},
        "candidate": {"decisions": candidate.decisions, "block_rate": candidate.block_rate},
        "block_rate_delta": delta,
        "ready": stable.decisions >= canary.min_sample and candidate.decisions >= canary.min_sample,
    }


def _rebind(session: Session, canary: PolicyCanary, version_id: str) -> None:
    """Point the policy's live binding at ``version_id``, closing whichever is open."""
    open_binding = session.scalar(
        select(PolicyBinding).where(
            PolicyBinding.policy_version_id.in_([canary.stable_version_id, canary.candidate_version_id]),
            PolicyBinding.effective_to.is_(None),
        )
    )
    if open_binding is None:
        return
    if open_binding.policy_version_id == version_id:
        return
    new_binding = PolicyBinding(
        policy_version_id=version_id,
        scope_json=open_binding.scope_json,
        mode=open_binding.mode,
        level=open_binding.level,
        scope_id=open_binding.scope_id,
        compose=open_binding.compose,
    )
    open_binding.effective_to = utcnow()
    session.add(new_binding)
    session.flush()


def rollback_canary(session: Session, canary_id: str, reason: str = "manual rollback") -> PolicyCanary:
    canary = session.get(PolicyCanary, canary_id)
    if canary is None:
        raise CanaryError(f"unknown canary '{canary_id}'")
    if canary.status != "rolling":
        return canary
    canary.status = "rolled_back"
    canary.percent = 0
    canary.rollback_reason = reason
    canary.completed_at = utcnow()
    _rebind(session, canary, canary.stable_version_id)
    session.flush()
    return canary


def canary_rollout(session: Session, canary_id: str) -> PolicyCanary:
    """Decide advance, hold, or roll back — from telemetry alone.

    - Not enough traffic yet in either cohort: hold at the current step.
    - Candidate's block rate exceeds stable's by more than ``max_block_rate_delta``:
      automatic rollback — the candidate is abandoned and the binding reverts to
      the stable version.
    - Otherwise healthy: advance to the next step. Reaching the last step (100)
      completes the canary and the candidate becomes the new stable version —
      the binding is repointed at it and the canary is closed out.
    """
    canary = session.get(PolicyCanary, canary_id)
    if canary is None:
        raise CanaryError(f"unknown canary '{canary_id}'")
    if canary.status != "rolling":
        return canary

    health = canary_health(session, canary)
    if not health["ready"]:
        return canary

    delta = health["block_rate_delta"]
    if delta is not None and delta > canary.max_block_rate_delta:
        return rollback_canary(
            session,
            canary_id,
            reason=(
                f"candidate block rate {health['candidate']['block_rate']:.0%} exceeds "
                f"stable {health['stable']['block_rate']:.0%} by more than the "
                f"{canary.max_block_rate_delta:.0%} health gate"
            ),
        )

    if canary.step_index >= len(canary.steps) - 1:
        canary.status = "completed"
        canary.percent = 100
        canary.completed_at = utcnow()
        _rebind(session, canary, canary.candidate_version_id)
    else:
        canary.step_index += 1
        canary.percent = canary.steps[canary.step_index]
    session.flush()
    return canary
