"""Inline enforcement routes (X-1a, X-1b, X-1c).

Drop-in by design (principle X-1): point an existing OpenAI or Anthropic client's
``base_url`` at this service and enforcement, tracing and audit start working with no
code change. That is what NFR-8's ten-minute time-to-first-value requires — a
governance product that needs a re-architecture never gets installed.

Blocks return a body carrying the trace id, the decision id, the rule that fired and
a human-readable reason. Never block without an auditable reason (X-4).
"""

from __future__ import annotations

import json
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...audit.otel import ingest_otlp
from ...enforcement import Enforcer
from ...registry.service import detect_shadow_agents
from ..deps import agent_credential, db

router = APIRouter(tags=["inline"])


def _trust_map(header: str | None) -> dict[str, str] | None:
    if not header:
        return None
    try:
        return {str(k): str(v) for k, v in json.loads(header).items()}
    except Exception:
        return None


def _blocked_response(result, status: int = 403) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={
            "error": {
                "type": "nometria_policy_violation",
                "message": result.reason or "blocked by policy",
                "verdict": result.verdict,
                "trace_id": result.trace_id,
                "decision_id": result.decision_id,
                "policy_version": result.policy_version_id,
                "rules_fired": result.rules_fired,
                "entities": result.entities,
                "approval_id": result.approval_id,
                # P3-12: "blocked by policy" is not an explanation, and an engineer
                # who cannot tell whether the guardrail was right will disable it.
                # The cheapest fix for a false positive must be filing one, not
                # turning the detector off — so the dispute route ships in the error.
                "explanation": result.explanation,
                "suppressed": result.suppressed,
            }
        },
        headers=_headers(result),
    )


def _headers(result) -> dict[str, str]:
    return {
        "X-Nometria-Trace": result.trace_id or "",
        "X-Nometria-Verdict": result.verdict,
        "X-Nometria-Effective-Verdict": result.effective_verdict,
        "X-Nometria-Decision": result.decision_id or "",
        "X-Nometria-Mode": result.mode,
        "X-Nometria-Latency-Ms": f"{result.latency_ms:.2f}",
    }


# ---------------------------------------------------------------------------
# SSE rendering (PL-1)
# ---------------------------------------------------------------------------


def _sse(payload: Any) -> str:
    return f"data: {json.dumps(payload, default=str)}\n\n"


def _openai_chunk(
    model: str, delta: str = "", finish: str | None = None, chunk_id: str = ""
) -> dict[str, Any]:
    return {
        "id": chunk_id or "chatcmpl-stream",
        "object": "chat.completion.chunk",
        "model": model,
        "choices": [
            {
                "index": 0,
                "delta": {"content": delta} if delta else {},
                "finish_reason": finish,
            }
        ],
    }


def _stream_openai(events, model: str):
    """Render enforced stream events as an OpenAI-compatible SSE stream.

    A block mid-stream emits an `error` event and then `[DONE]`, so a client that
    follows the OpenAI protocol terminates cleanly and *knows why* — rather than the
    silent truncation that a bare connection close would produce.
    """
    chunk_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
    for event in events:
        if event.kind == "delta":
            yield _sse(_openai_chunk(model, delta=event.delta, chunk_id=chunk_id))
        elif event.kind == "blocked":
            result = event.result
            yield _sse(
                {
                    "error": {
                        "type": "nometria_policy_violation",
                        "message": result.reason or "blocked by policy",
                        "verdict": result.verdict,
                        "trace_id": result.trace_id,
                        "decision_id": result.decision_id,
                        "rules_fired": result.rules_fired,
                        "entities": result.entities,
                    }
                }
            )
            yield "data: [DONE]\n\n"
            return
        elif event.kind == "done":
            yield _sse(
                _openai_chunk(model, finish=event.finish_reason or "stop", chunk_id=chunk_id)
            )
            # Trailing governance metadata: verdict is only knowable at the end, and
            # headers were already flushed when the stream opened.
            yield _sse({"nometria": event.result.to_json() if event.result else {}})
            yield "data: [DONE]\n\n"
            return
    yield "data: [DONE]\n\n"


def _stream_anthropic(events, model: str):
    """Render as Anthropic message-stream events."""
    yield _sse(
        {
            "type": "message_start",
            "message": {
                "id": f"msg_{uuid.uuid4().hex[:12]}",
                "model": model,
                "role": "assistant",
                "content": [],
            },
        }
    )
    yield _sse(
        {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}}
    )
    for event in events:
        if event.kind == "delta":
            yield _sse(
                {
                    "type": "content_block_delta",
                    "index": 0,
                    "delta": {"type": "text_delta", "text": event.delta},
                }
            )
        elif event.kind == "blocked":
            result = event.result
            yield _sse(
                {
                    "type": "error",
                    "error": {
                        "type": "nometria_policy_violation",
                        "message": result.reason or "blocked by policy",
                        "trace_id": result.trace_id,
                        "rules_fired": result.rules_fired,
                    },
                }
            )
            return
        elif event.kind == "done":
            yield _sse({"type": "content_block_stop", "index": 0})
            yield _sse(
                {
                    "type": "message_delta",
                    "delta": {"stop_reason": event.finish_reason or "end_turn"},
                    "usage": event.usage,
                    "nometria": event.result.to_json() if event.result else {},
                }
            )
            yield _sse({"type": "message_stop"})
            return


def _stream_headers(trace_hint: str = "") -> dict[str, str]:
    return {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Nometria-Streaming": "enforced",
        "X-Nometria-Trace": trace_hint,
    }


@router.post("/v1/chat/completions", summary="OpenAI-compatible inline proxy")
async def chat_completions(
    request: Request,
    session: Session = Depends(db),
    credential: str | None = Depends(agent_credential),
    x_nometria_agent: Annotated[str | None, Header()] = None,
    x_nometria_session: Annotated[str | None, Header()] = None,
    x_nometria_environment: Annotated[str | None, Header()] = None,
    x_nometria_intent: Annotated[str | None, Header()] = None,
    x_nometria_trust: Annotated[str | None, Header()] = None,
    x_nometria_provider: Annotated[str | None, Header()] = None,
    x_nometria_stream_mode: Annotated[str | None, Header()] = None,
) -> Any:
    body = await request.json()
    enforcer = Enforcer(session)

    if body.get("stream"):
        # PL-1: honour the caller's protocol. Previously this flag was silently
        # ignored and a non-streaming body returned, which breaks every streaming
        # client without telling it anything.
        events = enforcer.run_completion_stream(
            agent_slug=x_nometria_agent,
            messages=body.get("messages", []),
            model=body.get("model", "default"),
            provider=x_nometria_provider,
            credential=credential,
            environment=x_nometria_environment or "production",
            session_id=x_nometria_session,
            intent=x_nometria_intent,
            trust_map=_trust_map(x_nometria_trust),
            correlation=dict(request.headers),
            temperature=float(body.get("temperature", 0.0)),
            max_tokens=body.get("max_tokens"),
            mode=x_nometria_stream_mode,
        )
        return StreamingResponse(
            _stream_openai(events, body.get("model", "")),
            media_type="text/event-stream",
            headers=_stream_headers(),
        )

    result, response = enforcer.run_completion(
        agent_slug=x_nometria_agent,
        messages=body.get("messages", []),
        model=body.get("model", "default"),
        provider=x_nometria_provider,
        credential=credential,
        environment=x_nometria_environment or "production",
        session_id=x_nometria_session,
        intent=x_nometria_intent,
        trust_map=_trust_map(x_nometria_trust),
        correlation=dict(request.headers),
        temperature=float(body.get("temperature", 0.0)),
        max_tokens=body.get("max_tokens"),
    )
    if result.blocked:
        return _blocked_response(result)
    if result.escalated:
        return JSONResponse(
            status_code=202,
            content={
                "status": "awaiting_approval",
                "approval_id": result.approval_id,
                "poll": f"/api/approvals/{result.approval_id}",
                "reason": result.reason,
                "trace_id": result.trace_id,
            },
            headers=_headers(result),
        )
    return JSONResponse(content=response.to_openai(body.get("model", "")), headers=_headers(result))


@router.post("/v1/messages", summary="Anthropic-compatible inline proxy")
async def messages(
    request: Request,
    session: Session = Depends(db),
    credential: str | None = Depends(agent_credential),
    x_nometria_agent: Annotated[str | None, Header()] = None,
    x_nometria_session: Annotated[str | None, Header()] = None,
    x_nometria_environment: Annotated[str | None, Header()] = None,
    x_nometria_intent: Annotated[str | None, Header()] = None,
    x_nometria_trust: Annotated[str | None, Header()] = None,
    x_nometria_provider: Annotated[str | None, Header()] = None,
    x_nometria_stream_mode: Annotated[str | None, Header()] = None,
) -> Any:
    body = await request.json()
    payload = list(body.get("messages", []))
    if body.get("system"):
        payload = [{"role": "system", "content": body["system"]}, *payload]

    enforcer = Enforcer(session)
    if body.get("stream"):
        events = enforcer.run_completion_stream(
            agent_slug=x_nometria_agent,
            messages=payload,
            model=body.get("model", "default"),
            provider=x_nometria_provider,
            credential=credential,
            environment=x_nometria_environment or "production",
            session_id=x_nometria_session,
            intent=x_nometria_intent,
            trust_map=_trust_map(x_nometria_trust),
            correlation=dict(request.headers),
            temperature=float(body.get("temperature", 0.0)),
            max_tokens=body.get("max_tokens"),
            mode=x_nometria_stream_mode,
        )
        return StreamingResponse(
            _stream_anthropic(events, body.get("model", "")),
            media_type="text/event-stream",
            headers=_stream_headers(),
        )

    result, response = enforcer.run_completion(
        agent_slug=x_nometria_agent,
        messages=payload,
        model=body.get("model", "default"),
        provider=x_nometria_provider,
        credential=credential,
        environment=x_nometria_environment or "production",
        session_id=x_nometria_session,
        intent=x_nometria_intent,
        trust_map=_trust_map(x_nometria_trust),
        correlation=dict(request.headers),
        temperature=float(body.get("temperature", 0.0)),
        max_tokens=body.get("max_tokens"),
    )
    if result.blocked:
        return _blocked_response(result)
    if result.escalated:
        return JSONResponse(
            status_code=202,
            content={
                "status": "awaiting_approval",
                "approval_id": result.approval_id,
                "reason": result.reason,
                "trace_id": result.trace_id,
            },
            headers=_headers(result),
        )
    return JSONResponse(
        content=response.to_anthropic(body.get("model", "")), headers=_headers(result)
    )


# ---------------------------------------------------------------------------
# Direct guard endpoints — for teams that keep their own provider calls
# ---------------------------------------------------------------------------


class GuardContentRequest(BaseModel):
    agent: str
    content: str
    surface: str = "input"
    taint_source: str = "user"
    intent: str | None = None


class GuardToolCallRequest(BaseModel):
    agent: str
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    provenance: dict[str, str] = Field(default_factory=dict)
    intent: str | None = None
    prior_tools: list[str] = Field(default_factory=list)
    session_id: str | None = None


@router.post("/v1/guard/input", summary="Enforce on an input without proxying")
@router.post("/v1/guard/output", summary="Enforce on an output without proxying")
def guard_content(
    payload: GuardContentRequest,
    request: Request,
    session: Session = Depends(db),
) -> dict[str, Any]:
    surface = "output" if request.url.path.endswith("/output") else payload.surface
    return Enforcer(session).check_content(
        agent_slug=payload.agent,
        content=payload.content,
        surface=surface,
        taint_source=payload.taint_source,
    )


@router.post("/v1/guard/tool_call", summary="Authorise a tool call (P3-4, P2-2)")
def guard_tool_call(
    payload: GuardToolCallRequest,
    session: Session = Depends(db),
    credential: str | None = Depends(agent_credential),
) -> dict[str, Any]:
    from ...audit.trace import start_trace
    from ...registry.service import slugify

    enforcer = Enforcer(session)
    agent, _identity, _shadow = enforcer.resolve(payload.agent, credential)
    trace = start_trace(
        session,
        agent_id=agent.id if agent else None,
        agent_slug=slugify(payload.agent),
        session_id=payload.session_id,
        intent=payload.intent,
    )
    result = enforcer.guard_tool_call(
        agent_slug=payload.agent,
        tool_key=payload.tool,
        arguments=payload.arguments,
        provenance=payload.provenance,
        intent=payload.intent,
        trace=trace,
        credential=credential,
        prior_tools=payload.prior_tools,
    )
    return result.to_json()


# ---------------------------------------------------------------------------
# OTLP ingest (X-1c) — the zero-integration surface
# ---------------------------------------------------------------------------


@router.post("/v1/traces", summary="OTLP/HTTP trace ingest")
async def ingest_traces(request: Request, session: Session = Depends(db)) -> dict[str, Any]:
    payload = await request.json()
    summary = ingest_otlp(session, payload)

    # Passive observation is enough to populate the registry and raise shadow-agent
    # findings — a team gets Pillars 1 and 5 without changing a line of code.
    from ...registry.service import observe_agent

    for slug in summary.get("agents_seen", []):
        observe_agent(
            session,
            slug,
            framework=summary.get("frameworks", {}).get(slug),
        )
    summary["shadow_agents"] = detect_shadow_agents(session)
    return summary
