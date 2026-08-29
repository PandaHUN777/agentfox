"""Public playground — "attack our agent, see the real guardrail verdict."

Unauthenticated by design, the same way `inline.py`'s `/v1/guard/*` routes are: no
`current_user`, no role check, no account. What keeps this safe to expose publicly
is not auth, it's that every route here only ever touches one visitor's own
throwaway sandbox (`playground_sessions.py`) — never the deployment's real
database, never a real model provider, never real money or email (the seeded
`payments.transfer`/`email.send` tools have no real backend; the `echo` provider
never calls out).

Every verdict returned here comes from the same `Enforcer`/`McpGovernor` code path
the rest of the product uses — this file adds session plumbing, not detection
logic.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from ...models import Agent
from ...seed import AGENTS, CAPABILITIES, POISONED_DOCUMENT, TOOLS
from ..playground_sessions import PlaygroundSession, get_store, session_creation_limiter
from .playground_deps import playground_session

router = APIRouter(prefix="/api/playground", tags=["playground"])


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/sessions", status_code=201)
def create_session(request: Request) -> dict[str, Any]:
    if not session_creation_limiter.check(_client_key(request)):
        raise HTTPException(
            429,
            "Too many playground sandboxes from this address recently — please try "
            "again in a while.",
        )
    record = get_store().create()
    return {
        "session_id": record.id,
        "expires_in_seconds": 30 * 60,
        "agents": [
            {"slug": a["slug"], "name": a["name"], "purpose": a["purpose"]} for a in AGENTS
        ],
        "tools": {t["key"]: {"name": t["name"], "impact": t["impact"]} for t in TOOLS},
        "capabilities": CAPABILITIES,
        "poisoned_document": POISONED_DOCUMENT,
        "mode": "observe",
    }


class PlaygroundChatRequest(BaseModel):
    agent: str = "support-triage"
    message: str
    #: A "retrieved document" the visitor is free to edit — attached as a `tool`
    #: message on this one call, so indirect injection (Tier B) is something the
    #: visitor drives, not a fixed scripted moment.
    document: str | None = None


@router.post("/sessions/{session_id}/chat")
def chat(
    session_id: str,
    payload: PlaygroundChatRequest,
    record: PlaygroundSession = Depends(playground_session),
) -> dict[str, Any]:
    from ...enforcement import Enforcer
    from ...escalation import record_turn

    if not payload.message.strip():
        raise HTTPException(400, "message must not be empty")

    with record.session_scope() as session:
        enforcer = Enforcer(session)

        # Tier A — the assembled-conversation-window check, run *in addition to*
        # the single-message evaluation below, so a payload split across several
        # short messages is caught even when no single message alone is.
        window_result = enforcer.check_conversation_window(
            agent_slug=payload.agent,
            session_id=session_id,
            new_user_text=payload.message,
        )

        messages: list[dict[str, Any]] = [{"role": "user", "content": payload.message}]
        if payload.document:
            messages.append({"role": "tool", "content": payload.document})

        result, response = enforcer.run_completion(
            agent_slug=payload.agent,
            messages=messages,
            model="echo-1",
            session_id=session_id,
            intent="playground chat",
        )
        record.remember_trace(result.trace_id)

        answer = response.text if response is not None else None
        if answer:
            agent_row = session.scalar(select(Agent).where(Agent.slug == payload.agent))
            record_turn(
                session,
                session_id=session_id,
                agent_id=agent_row.id if agent_row else None,
                trace_id=result.trace_id,
                user_text=payload.message,
                agent_text=answer,
            )

        return {
            "reply": answer,
            "blocked": result.blocked,
            "escalated": result.escalated,
            "verdict": result.to_json(),
            "conversation_window_verdict": window_result.to_json(),
        }


class PlaygroundToolCallRequest(BaseModel):
    agent: str
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, str] = Field(default_factory=dict)
    intent: str | None = None


@router.post("/sessions/{session_id}/tool-call")
def tool_call(
    session_id: str,
    payload: PlaygroundToolCallRequest,
    record: PlaygroundSession = Depends(playground_session),
) -> dict[str, Any]:
    """Try a tool call directly — Tiers C (parameter exploitation) and D (excessive
    agency) don't need an LLM to decide to misbehave; the visitor decides.
    """
    from ...audit.trace import start_trace
    from ...enforcement import Enforcer
    from ...registry.service import slugify

    with record.session_scope() as session:
        enforcer = Enforcer(session)
        agent, _identity, _shadow = enforcer.resolve(payload.agent)
        trace = start_trace(
            session,
            agent_id=agent.id if agent else None,
            agent_slug=slugify(payload.agent),
            session_id=session_id,
            intent=payload.intent,
        )
        result = enforcer.guard_tool_call(
            agent_slug=payload.agent,
            tool_key=payload.tool,
            arguments=payload.arguments,
            provenance=payload.provenance or None,
            intent=payload.intent,
            trace=trace,
        )
        record.remember_trace(result.trace_id or trace.id)
        return result.to_json()


class PlaygroundEnforceRequest(BaseModel):
    mode: str


@router.post("/sessions/{session_id}/enforce")
def set_enforce_mode(
    session_id: str,
    payload: PlaygroundEnforceRequest,
    record: PlaygroundSession = Depends(playground_session),
) -> dict[str, Any]:
    """Flip the baseline policy observe -> enforce (or back) for this sandbox only.

    Nothing about the visitor's earlier messages changes retroactively — the point
    is to re-send the same injection afterwards and watch the verdict actually
    change from "would have blocked" to "blocked", the same "aha" `nometria demo`
    already walks through interactively (`cli/demo.py`, section 08).
    """
    from ...policy import set_mode

    if payload.mode not in ("observe", "enforce"):
        raise HTTPException(400, "mode must be 'observe' or 'enforce'")
    with record.session_scope() as session:
        set_mode(session, "baseline", payload.mode)
    return {"mode": payload.mode}


@router.get("/sessions/{session_id}/state")
def state(
    session_id: str,
    record: PlaygroundSession = Depends(playground_session),
) -> dict[str, Any]:
    """Everything the live sidebar needs: recent traces (decisions + detector runs
    + findings), the tamper-evident audit chain's own self-check, and compliance
    posture — all real, already-existing functions, just called and serialized.
    """
    from ...audit import chain
    from ...audit.trace import full_trace
    from ...compliance.status import compute_all, posture

    with record.session_scope() as session:
        compute_all(session)
        traces = [full_trace(session, tid) for tid in reversed(record.trace_ids)]
        chain_info = chain.chain_stats(session)
        verification = chain.verify_range(session)
        posture_info = posture(session)

    return {
        "traces": [t for t in traces if t is not None],
        "chain": {
            **chain_info,
            "verified": verification.valid,
            "entries_checked": verification.entries_checked,
        },
        "compliance": posture_info,
    }


@router.get("/sessions/{session_id}/trace/{trace_id}")
def trace_detail(
    session_id: str,
    trace_id: str,
    record: PlaygroundSession = Depends(playground_session),
) -> dict[str, Any]:
    from ...audit.trace import full_trace

    with record.session_scope() as session:
        detail = full_trace(session, trace_id)
    if detail is None:
        raise HTTPException(404, "trace not found in this sandbox")
    return detail
