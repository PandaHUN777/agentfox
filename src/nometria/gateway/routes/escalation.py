"""P11 — escalation governance over HTTP.

The route that matters is `GET /api/escalation/missed`. Everything else here is
plumbing that any HITL product has; that one answers the question nobody else asks —
which conversations qualified for a human and never got one.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...escalation import (
    DEFAULT_CONDITIONS,
    assess,
    breached_handoffs,
    build_context,
    detect_false_resolution,
    detect_missed_escalation,
    escalation_report,
    get_policy,
    handoff_completeness,
    raise_handoff,
    record_turn,
    set_policy,
    turn_depth_risk,
)
from ...models import Agent, ConversationTurn, Handoff, User, utcnow
from ..deps import current_user, db, require

router = APIRouter(prefix="/api/escalation", tags=["escalation"])


def _agent_id(session: Session, slug: str | None) -> str | None:
    if not slug:
        return None
    agent = session.scalar(select(Agent).where(Agent.slug == slug))
    if agent is None:
        raise HTTPException(404, f"unknown agent '{slug}'")
    return agent.id


# ---------------------------------------------------------------------------
# Policy (P11-1)
# ---------------------------------------------------------------------------


class PolicyIn(BaseModel):
    agent: str | None = None
    conditions: dict[str, Any] = Field(default_factory=dict)
    owner_role: str = "support"
    sla_minutes: int = Field(60, ge=1, le=10080)
    mode: str = "observe"


@router.get("/policy")
def read_policy(
    agent: str | None = None,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    policy = get_policy(session, _agent_id(session, agent))
    return {
        "agent": agent,
        "conditions": policy.conditions_json or DEFAULT_CONDITIONS,
        "owner_role": policy.owner_role,
        "sla_minutes": policy.sla_minutes,
        "mode": policy.mode,
        "defaults": DEFAULT_CONDITIONS,
    }


@router.put("/policy", status_code=201)
def write_policy(
    payload: PolicyIn,
    session: Session = Depends(db),
    _user: User = Depends(require("policy")),
) -> dict[str, Any]:
    policy = set_policy(
        session,
        agent_id=_agent_id(session, payload.agent),
        conditions=payload.conditions,
        owner_role=payload.owner_role,
        sla_minutes=payload.sla_minutes,
        mode=payload.mode,
    )
    return {"id": policy.id, "conditions": policy.conditions_json, "mode": policy.mode}


# ---------------------------------------------------------------------------
# Turn capture
# ---------------------------------------------------------------------------


class TurnIn(BaseModel):
    session_id: str
    agent: str | None = None
    trace_id: str | None = None
    user_text: str = ""
    agent_text: str = ""
    escalated: bool = False
    failed: bool = False
    confidence: float | None = None


@router.post("/turns", status_code=201)
def capture_turn(
    payload: TurnIn,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    """Record one turn with its signals.

    Signals are extracted here rather than at detection time, so a later change to the
    lexicon cannot make yesterday's conversations answer differently.
    """
    turn = record_turn(
        session,
        session_id=payload.session_id,
        agent_id=_agent_id(session, payload.agent),
        trace_id=payload.trace_id,
        user_text=payload.user_text,
        agent_text=payload.agent_text,
        escalated=payload.escalated,
        failed=payload.failed,
        confidence=payload.confidence,
    )
    return {"id": turn.id, "turn_index": turn.turn_index, "signals": turn.signals_json}


@router.get("/conversations/{session_id}")
def conversation(
    session_id: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    turns = list(
        session.scalars(select(ConversationTurn).where(ConversationTurn.session_id == session_id))
    )
    if not turns:
        raise HTTPException(404, "no turns recorded for that session")
    agent_id = next((t.agent_id for t in turns if t.agent_id), None)
    assessment = assess(turns, get_policy(session, agent_id))
    return {
        "session_id": session_id,
        "assessment": assessment.to_json(),
        "turn_depth": turn_depth_risk(turns, get_policy(session, agent_id)),
        "turns": [
            {
                "index": t.turn_index,
                "signals": t.signals_json,
                "escalated": t.escalated,
                "claims_resolution": t.resolved_claimed,
            }
            for t in sorted(turns, key=lambda t: t.turn_index)
        ],
    }


# ---------------------------------------------------------------------------
# The control (P11-2)
# ---------------------------------------------------------------------------


@router.get("/missed")
def missed(
    since_hours: int = Query(24, ge=1, le=8760),
    agent: str | None = None,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    """**The 31% control.** Conversations that qualified for a hand-off and got none.

    Read-only: this endpoint does not raise findings or retroactive hand-offs, so it
    is safe to poll from a dashboard. `POST /scan` is the one that acts.
    """
    return detect_missed_escalation(
        session, since_hours=since_hours, agent_slug=agent, raise_findings=False
    )


@router.post("/scan")
def scan(
    since_hours: int = Query(24, ge=1, le=8760),
    agent: str | None = None,
    session: Session = Depends(db),
    _user: User = Depends(require("approvals")),
) -> dict[str, Any]:
    """Run detection and act on it: findings, retroactive hand-offs, SLA breaches.

    Retroactive hand-offs are the point. Recording that a person was left waiting and
    then leaving them waiting produces an audit artefact, not a control.
    """
    result = detect_missed_escalation(session, since_hours=since_hours, agent_slug=agent)
    false_resolutions = detect_false_resolution(session, since_hours=since_hours)
    breached = breached_handoffs(session)
    return {
        **result,
        "false_resolutions": len(false_resolutions),
        "sla_breached": [h.id for h in breached],
    }


@router.get("/report")
def report(
    since_hours: int = Query(24, ge=1, le=8760),
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    return escalation_report(session, since_hours=since_hours)


# ---------------------------------------------------------------------------
# Hand-offs (P11-6/7)
# ---------------------------------------------------------------------------


class HandoffIn(BaseModel):
    session_id: str
    agent: str | None = None
    trace_id: str | None = None
    reason: str = ""
    context: dict[str, Any] = Field(default_factory=dict)


@router.post("/handoffs", status_code=201)
def create_handoff(
    payload: HandoffIn,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    turns = list(
        session.scalars(
            select(ConversationTurn).where(ConversationTurn.session_id == payload.session_id)
        )
    )
    agent_id = _agent_id(session, payload.agent) or next(
        (t.agent_id for t in turns if t.agent_id), None
    )
    context = payload.context or build_context(turns, payload.reason)
    handoff = raise_handoff(
        session,
        agent_id=agent_id,
        session_id=payload.session_id,
        trace_id=payload.trace_id,
        triggers=[],
        context=context,
    )
    return _handoff_json(handoff)


@router.get("/handoffs")
def list_handoffs(
    status: str | None = None,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    stmt = select(Handoff).order_by(Handoff.created_at.desc())
    if status:
        stmt = stmt.where(Handoff.status == status)
    return {"handoffs": [_handoff_json(h) for h in session.scalars(stmt)]}


@router.post("/handoffs/{handoff_id}/acknowledge")
def acknowledge(
    handoff_id: str,
    session: Session = Depends(db),
    user: User = Depends(current_user),
) -> dict[str, Any]:
    handoff = session.get(Handoff, handoff_id)
    if handoff is None:
        raise HTTPException(404, "unknown hand-off")
    handoff.acknowledged_at = utcnow()
    handoff.owner_user_id = user.id
    handoff.status = "acknowledged"
    session.flush()
    return _handoff_json(handoff)


def _handoff_json(handoff: Handoff) -> dict[str, Any]:
    completeness = handoff_completeness(handoff.context_json)
    return {
        "id": handoff.id,
        "session_id": handoff.session_id,
        "agent_id": handoff.agent_id,
        "status": handoff.status,
        "reason": handoff.reason,
        "triggers": handoff.triggers_json,
        "owner_role": handoff.owner_role,
        "due_at": handoff.due_at.isoformat() if handoff.due_at else None,
        "completeness": completeness,
        "detected_retroactively": handoff.detected_retroactively,
    }
