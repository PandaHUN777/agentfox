"""How each kind of proposed change is actually made — and unmade.

A proposal is inert until an applier exists for its kind. Each applier answers three
questions, and the service in :mod:`agentfox.improvement.proposals` refuses to move a
proposal whose applier cannot answer all three:

* ``direction`` — does this change tighten or loosen, **computed from the diff and the
  live configuration**, never taken from whoever filed it. A loop that mislabels a
  loosening as a tightening would otherwise walk straight past the one rule the
  contract says cannot be tuned.
* ``apply`` — make the change through the same functions a person would use, so the
  change is recorded the way a person's would be, and return what changed.
* ``revert`` — undo it. A change that cannot be undone is refused at apply time rather
  than discovered at rollback time.

Appliers never touch proposal status or write proposal audit entries; that is the
service's job. They do call the domain functions (``revoke_suppression``,
``save_policy``, ``start_canary``) that record their own domain-level entries.
"""

from __future__ import annotations

import datetime as dt
import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AuditEntry,
    ChangeProposal,
    GuardrailFeedback,
    Policy,
    PolicyBinding,
    PolicyCanary,
    PolicyVersion,
    Suppression,
)
from . import contract

#: Audit action the service records an apply under. Declared here because a revert
#: reads back what its own apply recorded — the chain, not a mutable column, is the
#: record of what was changed.
APPLY_ACTION = "operator.proposal.applied"


class ApplierError(ValueError):
    """The change cannot be computed, applied or reverted as proposed."""


@dataclass(frozen=True)
class Applier:
    kind: str
    #: ``(session, proposal) -> direction``. Computed from the diff and live state.
    direction: Callable[[Session, ChangeProposal], str]
    #: ``(session, proposal, *, actor) -> what changed``. A result carrying
    #: ``{"staged": "canary"}`` means the change is live for a cohort only.
    apply: Callable[..., dict[str, Any]]
    #: ``(session, proposal, *, actor) -> what was restored``.
    revert: Callable[..., dict[str, Any]]
    #: For staged applies: ``"rolling" | "completed" | "rolled_back"``.
    stage_status: Callable[[Session, ChangeProposal], str] | None = None


_REGISTRY: dict[str, Applier] = {}


def register(applier: Applier) -> Applier:
    _REGISTRY[applier.kind] = applier
    return applier


def get_applier(kind: str) -> Applier:
    applier = _REGISTRY.get(kind)
    if applier is None:
        raise ApplierError(
            f"no applier is registered for kind '{kind}'; it can be recommended but "
            "not applied"
        )
    return applier


def has_applier(kind: str) -> bool:
    return kind in _REGISTRY


def registered_kinds() -> list[str]:
    return sorted(_REGISTRY)


def applied_result(session: Session, proposal: ChangeProposal) -> dict[str, Any]:
    """What the most recent apply of this proposal recorded that it changed."""
    entry = session.scalars(
        select(AuditEntry)
        .where(
            AuditEntry.action == APPLY_ACTION,
            AuditEntry.subject_type == "change_proposal",
            AuditEntry.subject_id == proposal.id,
        )
        .order_by(AuditEntry.seq.desc())
        .limit(1)
    ).first()
    if entry is None:
        raise ApplierError(f"proposal {proposal.id} has no recorded apply to revert")
    return dict((entry.payload_json or {}).get("changed") or {})


def _aware(value: dt.datetime | None) -> dt.datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=dt.UTC)


# ---------------------------------------------------------------------------
# suppression.revoke — tightens
# ---------------------------------------------------------------------------


def _suppression_id(proposal: ChangeProposal) -> str:
    sid = (proposal.diff_json or {}).get("suppression_id") or proposal.target_ref
    if not sid:
        raise ApplierError("suppression.revoke needs diff.suppression_id or target_ref")
    return str(sid)


def _revertible_feedback(session: Session, suppression: Suppression) -> GuardrailFeedback:
    feedback = (
        session.get(GuardrailFeedback, suppression.feedback_id)
        if suppression.feedback_id
        else None
    )
    if feedback is None or feedback.label != "false_positive":
        raise ApplierError(
            f"suppression {suppression.id} has no false-positive report behind it, so "
            "revoking it could not be reverted through the suppression workflow; "
            "revoke it by hand instead"
        )
    return feedback


def _suppression_direction(session: Session, proposal: ChangeProposal) -> str:
    # Revoking an exception restores detection. There is no reading of this under
    # which it loosens anything.
    return contract.TIGHTENS


def _suppression_apply(session: Session, proposal: ChangeProposal, *, actor: str) -> dict[str, Any]:
    from ..guardrails.tuning import revoke_suppression

    suppression = session.get(Suppression, _suppression_id(proposal))
    if suppression is None:
        raise ApplierError(f"unknown suppression '{_suppression_id(proposal)}'")
    if not suppression.active:
        raise ApplierError(f"suppression {suppression.id} is not active; nothing to revoke")
    _revertible_feedback(session, suppression)  # reversible, or not applied at all

    revoke_suppression(
        session,
        suppression.id,
        actor=actor,
        reason=f"change proposal {proposal.id}: {proposal.title or 'revoke suppression'}",
    )
    return {
        "revoked": suppression.id,
        "detector": suppression.detector_key,
        "agent_id": suppression.agent_id,
        "entity_type": suppression.entity_type,
        "expires_at": _aware(suppression.expires_at).isoformat()
        if suppression.expires_at
        else None,
    }


def _suppression_revert(
    session: Session, proposal: ChangeProposal, *, actor: str
) -> dict[str, Any]:
    from ..guardrails.tuning import apply_suppression

    original = session.get(Suppression, _suppression_id(proposal))
    if original is None:
        raise ApplierError(f"unknown suppression '{_suppression_id(proposal)}'")
    if original.revoked_at is None:
        raise ApplierError(f"suppression {original.id} was never revoked; nothing to restore")
    feedback = _revertible_feedback(session, original)

    expires = _aware(original.expires_at)
    now = dt.datetime.now(dt.UTC)
    remaining_days = (
        max(1, math.ceil((expires - now).total_seconds() / 86400)) if expires else 30
    )
    restored = apply_suppression(
        session,
        feedback_id=feedback.id,
        scope="agent" if original.agent_id else "global",
        ttl_days=remaining_days,
        actor=actor,
        reason=(
            f"reverting change proposal {proposal.id}: restores suppression {original.id} "
            "with its original scope and expiry"
        ),
    )
    # Same scope and the same end date as the one revoked — not a fresh TTL, which
    # would quietly extend an exception nobody re-approved.
    restored.agent_id = original.agent_id
    restored.detector_key = original.detector_key
    restored.entity_type = original.entity_type
    restored.sample_hash = original.sample_hash
    restored.surface = original.surface
    restored.expires_at = original.expires_at
    session.flush()
    return {
        "restored": restored.id,
        "replaces": original.id,
        "agent_id": restored.agent_id,
        "entity_type": restored.entity_type,
        "expires_at": expires.isoformat() if expires else None,
        "already_expired": bool(expires and expires <= now),
    }


register(
    Applier(
        kind="suppression.revoke",
        direction=_suppression_direction,
        apply=_suppression_apply,
        revert=_suppression_revert,
    )
)


# ---------------------------------------------------------------------------
# policy.rule_min_score — either direction
# ---------------------------------------------------------------------------


def _policy_diff(proposal: ChangeProposal) -> tuple[str, str, float]:
    diff = proposal.diff_json or {}
    policy_key = diff.get("policy") or proposal.target_ref
    rule_id = diff.get("rule_id")
    if not policy_key or not rule_id or diff.get("to") is None:
        raise ApplierError("policy.rule_min_score needs diff.policy, diff.rule_id and diff.to")
    try:
        target = float(diff["to"])
    except (TypeError, ValueError) as exc:
        raise ApplierError("diff.to must be a number") from exc
    if not 0.0 <= target <= 1.0:
        raise ApplierError("diff.to must be between 0 and 1")
    return str(policy_key), str(rule_id), target


def _live_policy(session: Session, policy_key: str) -> tuple[Policy, PolicyVersion, PolicyBinding]:
    from ..policy.store import _open_binding_for_version

    policy = session.scalar(select(Policy).where(Policy.key == policy_key))
    if policy is None:
        raise ApplierError(f"unknown policy '{policy_key}'")
    for version in session.scalars(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy.id)
        .order_by(PolicyVersion.version.desc())
    ):
        binding = _open_binding_for_version(session, version.id)
        if binding is not None:
            return policy, version, binding
    raise ApplierError(f"policy '{policy_key}' has no live binding")


def _document(version: PolicyVersion):
    import yaml

    from ..policy.model import PolicyDocument

    return PolicyDocument.model_validate(version.compiled_json or yaml.safe_load(version.body))


def _rule(doc, rule_id: str):
    rule = next((r for r in doc.rules if r.id == rule_id), None)
    if rule is None:
        raise ApplierError(f"policy '{doc.key}' has no rule '{rule_id}'")
    if rule.when.detection is None:
        raise ApplierError(f"rule '{rule_id}' has no detection condition to tune")
    return rule


def min_score_direction(effect: str, current: float, target: float) -> str:
    """Raising ``min_score`` makes a rule fire on fewer detections.

    For a rule that restricts (block, escalate, redact, ...) that loosens. For an
    ``allow`` rule the reading inverts in principle, but whether an allow firing less
    tightens depends on every other rule and the default effect — so it is treated as
    loosening in both directions: a change the loop cannot reason about is a change a
    person decides.
    """
    if math.isclose(current, target):
        return contract.NEUTRAL
    if effect == "allow":
        return contract.LOOSENS
    return contract.LOOSENS if target > current else contract.TIGHTENS


def _policy_direction(session: Session, proposal: ChangeProposal) -> str:
    policy_key, rule_id, target = _policy_diff(proposal)
    _policy, version, _binding = _live_policy(session, policy_key)
    rule = _rule(_document(version), rule_id)
    return min_score_direction(rule.effect, rule.when.detection.min_score, target)


def _policy_apply(session: Session, proposal: ChangeProposal, *, actor: str) -> dict[str, Any]:
    from ..policy.canary import CanaryError, start_canary
    from ..policy.store import save_policy

    diff = proposal.diff_json or {}
    policy_key, rule_id, target = _policy_diff(proposal)
    _policy, prior, binding = _live_policy(session, policy_key)
    doc = _document(prior)
    rule = _rule(doc, rule_id)
    current = float(rule.when.detection.min_score)

    expected = diff.get("from")
    if expected is not None and not math.isclose(float(expected), current):
        raise ApplierError(
            f"rule '{rule_id}' has drifted: live min_score is {current}, the proposal was "
            f"computed against {expected}. Refile against the live policy."
        )
    if math.isclose(current, target):
        raise ApplierError(f"rule '{rule_id}' already has min_score {target}; nothing to change")

    rule.when.detection.min_score = target
    doc.scope = binding.scope_json or doc.scope
    _policy_row, new_version = save_policy(
        session,
        doc,
        author=actor,
        notes=f"change proposal {proposal.id}: {rule_id} min_score {current} -> {target}",
        bind_mode=binding.mode,
        level=binding.level or "org",
        scope_id=binding.scope_id or "*",
        compose=binding.compose or "extend",
    )
    result: dict[str, Any] = {
        "policy": policy_key,
        "rule_id": rule_id,
        "from": current,
        "to": target,
        "prior_version_id": prior.id,
        "prior_version": prior.version,
        "new_version_id": new_version.id,
        "new_version": new_version.version,
        "staged": None,
    }
    if diff.get("stage") == "canary":
        options = diff.get("canary") or {}
        try:
            canary = start_canary(
                session,
                policy_key,
                candidate_version=new_version.version,
                steps=options.get("steps"),
                min_sample=int(options.get("min_sample", 20)),
                started_by=actor,
            )
        except CanaryError as exc:
            raise ApplierError(f"could not stage canary: {exc}") from exc
        result["staged"] = "canary"
        result["canary_id"] = canary.id
    return result


def _policy_stage_status(session: Session, proposal: ChangeProposal) -> str:
    result = applied_result(session, proposal)
    canary = session.get(PolicyCanary, result.get("canary_id") or "")
    if canary is None:
        raise ApplierError(f"proposal {proposal.id} has no canary")
    return canary.status


def _policy_revert(session: Session, proposal: ChangeProposal, *, actor: str) -> dict[str, Any]:
    from ..policy.canary import rollback_canary
    from ..policy.store import _open_binding_for_version

    result = applied_result(session, proposal)
    prior_id = result.get("prior_version_id")
    new_id = result.get("new_version_id")
    if not prior_id or not new_id:
        raise ApplierError(f"proposal {proposal.id} recorded no versions to revert between")

    canary_id = result.get("canary_id")
    if canary_id:
        canary = session.get(PolicyCanary, canary_id)
        if canary is not None and canary.status == "rolling":
            rollback_canary(
                session, canary.id, reason=f"change proposal {proposal.id} rolled back"
            )
            return {"rebound_to": prior_id, "canary_rolled_back": canary.id}

    open_on_new = _open_binding_for_version(session, new_id)
    if open_on_new is None:
        if _open_binding_for_version(session, prior_id) is not None:
            return {"rebound_to": prior_id, "already_bound": True}
        raise ApplierError(
            f"policy '{result.get('policy')}' has moved on since this change; refusing to "
            "overwrite a binding this proposal did not create"
        )
    # Versions are immutable, so undoing the change is rebinding the version it
    # replaced — not saving a copy of it as yet another version.
    session.add(
        PolicyBinding(
            policy_version_id=prior_id,
            scope_json=open_on_new.scope_json,
            mode=open_on_new.mode,
            level=open_on_new.level,
            scope_id=open_on_new.scope_id,
            compose=open_on_new.compose,
        )
    )
    open_on_new.effective_to = dt.datetime.now(dt.UTC)
    session.flush()
    return {"rebound_to": prior_id, "unbound": new_id}


register(
    Applier(
        kind="policy.rule_min_score",
        direction=_policy_direction,
        apply=_policy_apply,
        revert=_policy_revert,
        stage_status=_policy_stage_status,
    )
)


__all__ = [
    "APPLY_ACTION",
    "Applier",
    "ApplierError",
    "applied_result",
    "get_applier",
    "has_applier",
    "min_score_direction",
    "register",
    "registered_kinds",
]
