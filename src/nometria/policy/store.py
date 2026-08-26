"""Policy persistence and binding resolution (P6-1).

Two invariants live here:

* **Versions are immutable.** Saving a changed body creates version *n+1*; it never
  rewrites *n*. Decisions reference the version id, so history stays truthful even
  after the policy is edited (Appendix E.1.5 — "that rule was always on").
* **Bindings carry the mode.** A policy version bound in ``observe`` records what it
  *would* have done; the same version bound in ``enforce`` blocks. Promotion between
  the two is an explicit, audited act (PRD R3).
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Policy, PolicyBinding, PolicyVersion, utcnow
from .canary import active_canary, pick_version_id
from .engine import NativePolicyEngine, PolicyEngine
from .hierarchy import EffectivePolicy, PolicyLayer, lint_policy, lint_summary, resolve_effective
from .model import PolicyDocument
from .opa import OpaPolicyEngine


def get_engine(name: str | None = None) -> PolicyEngine:
    choice = name or get_settings().policy_engine
    if choice == "opa":
        engine = OpaPolicyEngine()
        if engine.available():
            return engine
        # Deliberate: an unreachable sidecar must not silently disable policy.
        return NativePolicyEngine()
    return NativePolicyEngine()


def load_from_dir(directory: Path | None = None) -> list[PolicyDocument]:
    directory = directory or get_settings().policies_dir
    out: list[PolicyDocument] = []
    if not directory.exists():
        return out
    for path in sorted(directory.glob("*.y*ml")):
        out.append(PolicyDocument.from_yaml(path.read_text()))
    return out


def active_layers(session: Session, subject: dict[str, str] | None = None) -> list[PolicyLayer]:
    """Every bound policy version, as hierarchy layers (P12)."""
    now = utcnow()
    rows = session.scalars(
        select(PolicyBinding).where(
            PolicyBinding.effective_from <= now,
            (PolicyBinding.effective_to.is_(None)) | (PolicyBinding.effective_to > now),
        )
    ).all()

    layers: list[PolicyLayer] = []
    for binding in rows:
        version = session.get(PolicyVersion, binding.policy_version_id)
        if version is None:
            continue
        doc = PolicyDocument.model_validate(version.compiled_json or yaml.safe_load(version.body))
        scope = binding.scope_json or doc.scope
        doc.scope = scope
        doc.mode = binding.mode
        if subject is not None:
            agent = subject.get("agent")
            environment = subject.get("environment")
            if not doc.matches_scope(agent, environment):
                continue
        layers.append(
            PolicyLayer(
                document=doc,
                level=binding.level or "org",
                scope_id=binding.scope_id or "*",
                mode=binding.compose or "extend",
            )
        )
    return layers


def effective_for(
    session: Session,
    agent_slug: str | None = None,
    environment: str | None = None,
    team: str | None = None,
    user: str | None = None,
    org: str | None = None,
) -> EffectivePolicy:
    """Resolve the policy actually in force for a subject, with provenance."""
    subject = {
        "org": org or get_settings().org_id,
        "team": team or "*",
        "agent": agent_slug or "*",
        "user": user or "*",
        "environment": environment or "*",
    }
    return resolve_effective(active_layers(session, subject), subject)


def lint_all(session: Session) -> dict:
    """Lint every bound policy layer. Intended for CI (P12-4)."""
    return lint_summary(lint_policy(active_layers(session)))


def save_policy(
    session: Session,
    doc: PolicyDocument,
    author: str = "system",
    notes: str = "",
    bind_mode: str | None = None,
    level: str = "org",
    scope_id: str = "*",
    compose: str = "extend",
) -> tuple[Policy, PolicyVersion]:
    """Upsert a policy and append an immutable version."""
    policy = session.scalar(select(Policy).where(Policy.key == doc.key))
    if policy is None:
        policy = Policy(key=doc.key, name=doc.name or doc.key, description=doc.description)
        session.add(policy)
        session.flush()

    body = doc.to_yaml()
    latest = session.scalars(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy.id)
        .order_by(PolicyVersion.version.desc())
    ).first()

    body_unchanged = latest is not None and latest.body == body
    if body_unchanged:
        version = latest  # no-op edit on the rules; do not manufacture a version
    else:
        version = PolicyVersion(
            policy_id=policy.id,
            version=(latest.version + 1) if latest else doc.version,
            body=body,
            compiled_json=doc.model_dump(),
            author=author,
            notes=notes,
        )
        session.add(version)
        session.flush()

    mode = bind_mode or doc.mode
    current_binding = (
        session.scalar(
            select(PolicyBinding).where(
                PolicyBinding.policy_version_id == version.id,
                PolicyBinding.effective_to.is_(None),
            )
        )
        if body_unchanged
        else None
    )
    if (
        current_binding is not None
        and current_binding.mode == mode
        and current_binding.level == level
        and current_binding.scope_id == scope_id
        and current_binding.compose == compose
    ):
        return policy, version  # rules, mode, and hierarchy placement all unchanged

    _close_open_bindings(session, policy.id)
    session.add(
        PolicyBinding(
            policy_version_id=version.id,
            scope_json=doc.scope or {},
            mode=mode,
            level=level,
            scope_id=scope_id,
            compose=compose,
        )
    )
    session.flush()
    return policy, version


def _close_open_bindings(session: Session, policy_id: str) -> None:
    version_ids = [
        v.id
        for v in session.scalars(select(PolicyVersion).where(PolicyVersion.policy_id == policy_id))
    ]
    if not version_ids:
        return
    for binding in session.scalars(
        select(PolicyBinding).where(
            PolicyBinding.policy_version_id.in_(version_ids),
            PolicyBinding.effective_to.is_(None),
        )
    ):
        binding.effective_to = utcnow()


def active_policies(
    session: Session, agent_slug: str | None = None, environment: str | None = None
) -> list[tuple[PolicyDocument, PolicyVersion, PolicyBinding]]:
    """Every policy version currently bound and in scope, with its mode applied."""
    now = utcnow()
    rows = session.scalars(
        select(PolicyBinding).where(
            PolicyBinding.effective_from <= now,
            (PolicyBinding.effective_to.is_(None)) | (PolicyBinding.effective_to > now),
        )
    ).all()

    out = []
    for binding in rows:
        version = session.get(PolicyVersion, binding.policy_version_id)
        if version is None:
            continue
        # P12-6 — a running canary splits live traffic between the bound (stable)
        # version and a candidate by percentage, per request. `active_canary` only
        # returns a hit when the binding still points at the canary's own recorded
        # stable version, so a binding that moved out from under a stale canary
        # (e.g. someone edited the policy directly) is never silently overridden.
        canary = active_canary(session, version.policy_id)
        if canary is not None and canary.stable_version_id == version.id:
            picked_id = pick_version_id(canary)
            if picked_id != version.id:
                candidate_version = session.get(PolicyVersion, picked_id)
                if candidate_version is not None:
                    version = candidate_version
        doc = PolicyDocument.model_validate(version.compiled_json or yaml.safe_load(version.body))
        scope = binding.scope_json or doc.scope
        doc.scope = scope
        if not doc.matches_scope(agent_slug, environment):
            continue
        doc.mode = binding.mode  # the binding, not the document, decides enforcement
        out.append((doc, version, binding))
    return out


def set_mode(session: Session, policy_key: str, mode: str) -> PolicyBinding | None:
    """Promote (or demote) a policy between observe and enforce."""
    policy = session.scalar(select(Policy).where(Policy.key == policy_key))
    if policy is None:
        return None
    version = session.scalars(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy.id)
        .order_by(PolicyVersion.version.desc())
    ).first()
    if version is None:
        return None
    binding = session.scalars(
        select(PolicyBinding).where(
            PolicyBinding.policy_version_id == version.id,
            PolicyBinding.effective_to.is_(None),
        )
    ).first()
    if binding is None:
        binding = PolicyBinding(policy_version_id=version.id, scope_json={}, mode=mode)
        session.add(binding)
    else:
        binding.mode = mode
    session.flush()
    return binding


def history(session: Session, policy_key: str) -> list[dict]:
    policy = session.scalar(select(Policy).where(Policy.key == policy_key))
    if policy is None:
        return []
    versions = session.scalars(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy.id)
        .order_by(PolicyVersion.version)
    ).all()
    return [
        {
            "id": v.id,
            "version": v.version,
            "author": v.author,
            "notes": v.notes,
            "created_at": v.created_at.isoformat()
            if isinstance(v.created_at, dt.datetime)
            else None,
            "rules": len((v.compiled_json or {}).get("rules", [])),
        }
        for v in versions
    ]
