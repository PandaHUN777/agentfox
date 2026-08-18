"""Policy routes (P6-1, P2-7).

The route worth noting is ``/api/policies/simulate``: it replays recorded traffic
against a candidate policy and returns the diff. Promotion to ``enforce`` is a
separate, audited act — the product should make "turn this on" a reviewed change
rather than a toggle, because a false block is how guardrails get disabled for good.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...audit import chain
from ...models import Policy, PolicyBinding, PolicyVersion, User
from ...policy import (
    PolicyDocument,
    compile_to_rego,
    effective_for,
    history,
    lint_all,
    record_simulation,
    save_policy,
    set_mode,
    simulate,
)
from ..deps import current_user, db, require

router = APIRouter(prefix="/api/policies", tags=["policy"])


@router.get("")
def list_policies(
    session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    out = []
    for policy in session.scalars(select(Policy).order_by(Policy.key)):
        versions = list(
            session.scalars(
                select(PolicyVersion)
                .where(PolicyVersion.policy_id == policy.id)
                .order_by(PolicyVersion.version.desc())
            )
        )
        latest = versions[0] if versions else None
        binding = (
            session.scalars(
                select(PolicyBinding).where(
                    PolicyBinding.policy_version_id == latest.id,
                    PolicyBinding.effective_to.is_(None),
                )
            ).first()
            if latest
            else None
        )
        out.append(
            {
                "key": policy.key,
                "name": policy.name,
                "description": policy.description,
                "versions": len(versions),
                "latest_version": latest.version if latest else None,
                "mode": binding.mode if binding else None,
                "rules": len((latest.compiled_json or {}).get("rules", [])) if latest else 0,
            }
        )
    return {"policies": out}


# ---------------------------------------------------------------------------
# Hierarchy (P12)
# ---------------------------------------------------------------------------


@router.get("/effective")
def get_effective(
    agent: str | None = None,
    team: str | None = None,
    user: str | None = None,
    environment: str = "production",
    session: Session = Depends(db),
    _u: User = Depends(current_user),
) -> dict[str, Any]:
    """The policy actually in force for a subject, with per-rule provenance (P12-3)."""
    return effective_for(
        session, agent_slug=agent, environment=environment, team=team, user=user
    ).explain()


@router.get("/lint")
def get_lint(session: Session = Depends(db), _u: User = Depends(current_user)) -> dict[str, Any]:
    """Policy lint (P12-4). `passed` is false when critical/high findings exist."""
    return lint_all(session)


@router.get("/{key}")
def get_policy(
    key: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    policy = session.scalar(select(Policy).where(Policy.key == key))
    if policy is None:
        raise HTTPException(404, f"unknown policy '{key}'")
    versions = history(session, key)
    latest = session.scalars(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy.id)
        .order_by(PolicyVersion.version.desc())
    ).first()
    return {
        "key": policy.key,
        "name": policy.name,
        "description": policy.description,
        "versions": versions,
        "body": latest.body if latest else "",
        "compiled": latest.compiled_json if latest else {},
    }


class PolicyIn(BaseModel):
    body: str
    notes: str = ""
    mode: str | None = None


@router.post("", status_code=201)
def upsert_policy(
    payload: PolicyIn, session: Session = Depends(db), user: User = Depends(require("policy"))
) -> dict[str, Any]:
    try:
        doc = PolicyDocument.from_yaml(payload.body)
    except Exception as exc:
        raise HTTPException(400, f"invalid policy: {exc}") from exc

    # Binding a policy straight to enforce in production requires the stronger role.
    if (payload.mode or doc.mode) == "enforce" and user.role not in {"owner", "admin", "security"}:
        raise HTTPException(
            403, f"role '{user.role}' may author policies but not bind them to enforce"
        )

    policy, version = save_policy(
        session, doc, author=user.email, notes=payload.notes, bind_mode=payload.mode
    )
    chain.append(
        session,
        "policy.version_created",
        actor_type="user",
        actor_id=user.email,
        subject_type="policy_version",
        subject_id=version.id,
        payload={
            "policy": policy.key,
            "version": version.version,
            "mode": payload.mode or doc.mode,
            "notes": payload.notes,
        },
    )
    return {"key": policy.key, "version": version.version, "version_id": version.id}


@router.post("/validate")
def validate_policy(payload: PolicyIn) -> dict[str, Any]:
    try:
        doc = PolicyDocument.from_yaml(payload.body)
    except Exception as exc:
        return {"valid": False, "error": str(exc)}
    return {
        "valid": True,
        "key": doc.key,
        "rules": len(doc.rules),
        "mode": doc.mode,
        "controls": sorted({c for r in doc.rules for c in r.controls}),
        "rego": compile_to_rego(doc),
    }


class ModeIn(BaseModel):
    mode: str


@router.post("/{key}/mode")
def change_mode(
    key: str,
    payload: ModeIn,
    session: Session = Depends(db),
    user: User = Depends(require("policy_production")),
) -> dict[str, Any]:
    if payload.mode not in ("observe", "enforce"):
        raise HTTPException(400, "mode must be 'observe' or 'enforce'")
    binding = set_mode(session, key, payload.mode)
    if binding is None:
        raise HTTPException(404, f"unknown policy '{key}'")
    chain.append(
        session,
        f"policy.mode_{payload.mode}",
        actor_type="user",
        actor_id=user.email,
        subject_type="policy",
        subject_id=key,
        payload={"mode": payload.mode},
    )
    return {"key": key, "mode": binding.mode}


class SimulateIn(BaseModel):
    body: str
    agent: str | None = None
    since_days: int = 30
    limit: int = 1000
    persist: bool = True


@router.post("/simulate")
def simulate_policy(
    payload: SimulateIn, session: Session = Depends(db), user: User = Depends(current_user)
) -> dict[str, Any]:
    """P2-7 — replay recorded traffic against a candidate policy."""
    try:
        candidate = PolicyDocument.from_yaml(payload.body)
    except Exception as exc:
        raise HTTPException(400, f"invalid policy: {exc}") from exc

    diff = simulate(
        session,
        candidate,
        agent_slug=payload.agent,
        since=dt.datetime.now(dt.UTC) - dt.timedelta(days=payload.since_days),
        limit=payload.limit,
    )
    result = diff.to_json()
    result["risky"] = diff.risky
    result["recommendation"] = (
        "Review the newly blocked decisions before promoting to enforce — each one is "
        "production traffic that would now fail."
        if diff.risky
        else "No production traffic would newly block; safe to promote to enforce."
    )
    if payload.persist:
        run = record_simulation(
            session,
            candidate,
            diff,
            run_by=user.email,
            scope={"agent": payload.agent, "since_days": payload.since_days},
        )
        result["simulation_id"] = run.id
    return result


@router.get("/{key}/rego")
def get_rego(
    key: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    policy = session.scalar(select(Policy).where(Policy.key == key))
    if policy is None:
        raise HTTPException(404, f"unknown policy '{key}'")
    latest = session.scalars(
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy.id)
        .order_by(PolicyVersion.version.desc())
    ).first()
    doc = PolicyDocument.model_validate(latest.compiled_json)
    return {"key": key, "version": latest.version, "rego": compile_to_rego(doc)}
