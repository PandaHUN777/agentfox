"""Control-plane routes for Pillars 1 and 2 — registry, identity, approvals."""

from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...audit import chain
from ...identity import (
    assess_posture,
    check_capability,
    delegate,
    expire_stale_approvals,
    grant_capability,
    issue_credential,
    resolve_approval,
    revoke_credential,
    rotate_credential,
)
from ...models import (
    Agent,
    ApprovalRequest,
    Capability,
    Credential,
    Finding,
    Identity,
    McpServer,
    Tool,
    User,
    utcnow,
)
from ...registry.control import UnknownAgent, all_controls, set_state
from ...registry.service import (
    attest_registry,
    derive_lineage,
    detect_shadow_agents,
    inventory,
    lineage,
    register_agent,
    scan_mcp_server,
    unowned_agents,
    upsert_mcp_server,
    upsert_tool,
)
from ..deps import current_user, db, require

router = APIRouter(prefix="/api", tags=["registry", "identity"])


# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------


class AgentIn(BaseModel):
    slug: str
    name: str = ""
    purpose: str = ""
    owner_email: str | None = None
    owner_team: str | None = None
    environment: str = "production"
    risk_tier: str = "limited"
    declared_models: list[str] = Field(default_factory=list)
    declared_tools: list[str] = Field(default_factory=list)
    data_classes: list[str] = Field(default_factory=list)
    framework: str | None = None


def _agent_json(agent: Agent, session: Session | None = None) -> dict[str, Any]:
    control = "active"
    if session is not None:
        from ...models import AgentControl

        row = session.scalar(select(AgentControl).where(AgentControl.agent_id == agent.id))
        control = row.state if row else "active"
    return {
        "control_state": control,
        "id": agent.id,
        "slug": agent.slug,
        "name": agent.name,
        "purpose": agent.purpose,
        "owner_email": agent.owner_email,
        "owner_team": agent.owner_team,
        "environment": agent.environment,
        "risk_tier": agent.risk_tier,
        "framework": agent.framework,
        "status": agent.status,
        "registered": agent.registered,
        "owned": agent.is_owned,
        "declared_models": agent.declared_models,
        "declared_tools": agent.declared_tools,
        "data_classes": agent.data_classes,
        "first_seen_at": _iso(agent.first_seen_at),
        "last_seen_at": _iso(agent.last_seen_at),
    }


@router.get("/agents")
def list_agents(
    session: Session = Depends(db),
    registered: bool | None = None,
    environment: str | None = None,
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    query = select(Agent).order_by(Agent.slug)
    if registered is not None:
        query = query.where(Agent.registered.is_(registered))
    if environment:
        query = query.where(Agent.environment == environment)
    return {
        "agents": [_agent_json(a, session) for a in session.scalars(query)],
        "inventory": inventory(session),
    }


@router.post("/agents", status_code=201)
def create_agent(
    payload: AgentIn,
    session: Session = Depends(db),
    user: User = Depends(require("registry")),
) -> dict[str, Any]:
    agent = register_agent(session, **payload.model_dump())
    chain.append(
        session,
        "agent.registered",
        actor_type="user",
        actor_id=user.email,
        subject_type="agent",
        subject_id=agent.id,
        payload=payload.model_dump(),
    )
    return _agent_json(agent)


@router.get("/agents/{slug}")
def get_agent(
    slug: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    agent = session.scalar(select(Agent).where(Agent.slug == slug))
    if agent is None:
        raise HTTPException(404, f"unknown agent '{slug}'")
    return _agent_json(agent, session)


@router.get("/agents/{slug}/lineage")
def agent_lineage(
    slug: str, depth: int = 2, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    derive_lineage(session, slug)
    return lineage(session, slug, depth)


@router.get("/agents/{slug}/posture")
def agent_posture(
    slug: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    from ...evaluation.drift import evaluate_slos
    from ...models import Decision, Trace

    agent = session.scalar(select(Agent).where(Agent.slug == slug))
    if agent is None:
        raise HTTPException(404, f"unknown agent '{slug}'")

    traces = list(session.scalars(select(Trace).where(Trace.agent_slug == slug)))
    decisions = list(session.scalars(select(Decision).where(Decision.agent_id == agent.id)))
    findings = list(
        session.scalars(
            select(Finding).where(
                Finding.subject_id.in_([agent.id, slug]), Finding.status == "open"
            )
        )
    )
    by_verdict: dict[str, int] = {}
    for decision in decisions:
        by_verdict[decision.verdict] = by_verdict.get(decision.verdict, 0) + 1

    return {
        "agent": _agent_json(agent, session),
        "traces": len(traces),
        "decisions": len(decisions),
        "decisions_by_verdict": by_verdict,
        "blocked": by_verdict.get("block", 0),
        "escalated": by_verdict.get("escalate", 0),
        "open_findings": [
            {"id": f.id, "type": f.type, "severity": f.severity, "title": f.title} for f in findings
        ],
        "slos": evaluate_slos(session, slug),
    }


@router.get("/discovery/shadow")
def shadow_agents(
    window_days: int = 30, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    return {"shadow_agents": detect_shadow_agents(session, window_days)}


@router.post("/discovery/scan")
def run_discovery(
    session: Session = Depends(db), user: User = Depends(require("registry"))
) -> dict[str, Any]:
    """Sweep: lineage, unowned agents, registry drift, identity posture."""
    edges = derive_lineage(session)
    unowned = unowned_agents(session)
    drift = attest_registry(session)
    posture = assess_posture(session)
    chain.append(
        session,
        "discovery.scan",
        actor_type="user",
        actor_id=user.email,
        payload={
            "edges": edges,
            "unowned": len(unowned),
            "drift": len(drift),
            "posture": len(posture),
        },
    )
    return {
        "lineage_edges": edges,
        "unowned_agents": len(unowned),
        "registry_drift": len(drift),
        "identity_posture_findings": len(posture),
        "shadow_agents": detect_shadow_agents(session),
    }


# ---------------------------------------------------------------------------
# Tools & MCP
# ---------------------------------------------------------------------------


class ToolIn(BaseModel):
    key: str
    name: str = ""
    kind: str = "function"
    impact: str = "read"
    description: str = ""
    json_schema: dict[str, Any] = Field(default_factory=dict)


@router.get("/tools")
def list_tools(
    session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    return {
        "tools": [
            {
                "key": t.key,
                "name": t.name,
                "kind": t.kind,
                "impact": t.impact,
                "description": t.description,
                "mcp_server_id": t.mcp_server_id,
            }
            for t in session.scalars(select(Tool).order_by(Tool.key))
        ]
    }


@router.post("/tools", status_code=201)
def create_tool(
    payload: ToolIn, session: Session = Depends(db), _user: User = Depends(require("registry"))
) -> dict[str, Any]:
    tool = upsert_tool(
        session,
        payload.key,
        name=payload.name,
        kind=payload.kind,
        impact=payload.impact,
        schema=payload.json_schema,
        description=payload.description,
    )
    return {"key": tool.key, "impact": tool.impact}


class McpIn(BaseModel):
    name: str
    url: str = ""
    transport: str = "stdio"
    trust_level: str = "untrusted"
    pinned_version: str | None = None


@router.get("/mcp-servers")
def list_mcp(session: Session = Depends(db), _user: User = Depends(current_user)) -> dict[str, Any]:
    return {
        "servers": [
            {
                "id": s.id,
                "name": s.name,
                "url": s.url,
                "transport": s.transport,
                "trust_level": s.trust_level,
                "pinned_version": s.pinned_version,
                "last_scanned_at": _iso(s.last_scanned_at),
            }
            for s in session.scalars(select(McpServer))
        ]
    }


@router.post("/mcp-servers", status_code=201)
def create_mcp(
    payload: McpIn, session: Session = Depends(db), _user: User = Depends(require("registry"))
) -> dict[str, Any]:
    server = upsert_mcp_server(session, **payload.model_dump())
    return {"id": server.id, "name": server.name}


class McpScanIn(BaseModel):
    tools: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/mcp-servers/{name}/scan")
def scan_mcp(
    name: str,
    payload: McpScanIn,
    session: Session = Depends(db),
    _user: User = Depends(require("registry")),
) -> dict[str, Any]:
    server = session.scalar(select(McpServer).where(McpServer.name == name))
    if server is None:
        raise HTTPException(404, f"unknown MCP server '{name}'")
    return scan_mcp_server(session, server, payload.tools)


# ---------------------------------------------------------------------------
# Findings
# ---------------------------------------------------------------------------


@router.get("/findings")
def list_findings(
    status: str | None = "open",
    severity: str | None = None,
    type: str | None = None,
    limit: int = 200,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    query = select(Finding).order_by(Finding.created_at.desc()).limit(limit)
    if status:
        query = query.where(Finding.status == status)
    if severity:
        query = query.where(Finding.severity == severity)
    if type:
        query = query.where(Finding.type == type)
    return {
        "findings": [
            {
                "id": f.id,
                "type": f.type,
                "severity": f.severity,
                "status": f.status,
                "title": f.title,
                "subject_type": f.subject_type,
                "subject_id": f.subject_id,
                "controls": f.control_keys,
                "evidence": f.evidence_json,
                "created_at": _iso(f.created_at),
            }
            for f in session.scalars(query)
        ]
    }


class FindingPatch(BaseModel):
    status: str
    suppression_reason: str | None = None


@router.patch("/findings/{finding_id}")
def patch_finding(
    finding_id: str,
    payload: FindingPatch,
    session: Session = Depends(db),
    user: User = Depends(require("registry")),
) -> dict[str, Any]:
    finding = session.get(Finding, finding_id)
    if finding is None:
        raise HTTPException(404, "unknown finding")
    if payload.status == "suppressed" and not payload.suppression_reason:
        # Suppression without a recorded justification is how a finding queue becomes
        # meaningless; the reason is the control, not the button.
        raise HTTPException(400, "suppression requires a justification")
    finding.status = payload.status
    finding.suppression_reason = payload.suppression_reason
    finding.suppressed_by = user.email if payload.status == "suppressed" else None
    if payload.status == "resolved":
        finding.resolved_at = utcnow()
    chain.append(
        session,
        f"finding.{payload.status}",
        actor_type="user",
        actor_id=user.email,
        subject_type="finding",
        subject_id=finding.id,
        payload={"type": finding.type, "reason": payload.suppression_reason},
    )
    return {"id": finding.id, "status": finding.status}


# ---------------------------------------------------------------------------
# Identities, credentials, capabilities
# ---------------------------------------------------------------------------


@router.get("/identities")
def list_identities(
    session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    out = []
    for identity in session.scalars(select(Identity)):
        credentials = list(
            session.scalars(select(Credential).where(Credential.identity_id == identity.id))
        )
        capabilities = list(
            session.scalars(select(Capability).where(Capability.identity_id == identity.id))
        )
        out.append(
            {
                "id": identity.id,
                "principal": identity.principal,
                "agent_id": identity.agent_id,
                "kind": identity.kind,
                "status": identity.status,
                "posture": identity.posture,
                "last_used_at": _iso(identity.last_used_at),
                "credentials": [
                    {
                        "id": c.id,
                        "prefix": c.key_prefix,
                        "active": c.active,
                        "expires_at": _iso(c.expires_at),
                        "revoked_at": _iso(c.revoked_at),
                    }
                    for c in credentials
                ],
                "capabilities": [
                    {
                        "id": c.id,
                        "tool_key": c.tool_key,
                        "actions": c.actions,
                        "constraints": c.constraints_json,
                        "max_taint": c.max_taint,
                        "requires_approval": c.requires_approval,
                    }
                    for c in capabilities
                ],
            }
        )
    return {"identities": out}


@router.post("/identities/{identity_id}/credentials", status_code=201)
def issue(
    identity_id: str,
    ttl_days: int = 90,
    session: Session = Depends(db),
    user: User = Depends(require("identity")),
) -> dict[str, Any]:
    identity = session.get(Identity, identity_id)
    if identity is None:
        raise HTTPException(404, "unknown identity")
    credential, raw = issue_credential(session, identity, ttl_days=ttl_days)
    chain.append(
        session,
        "credential.issued",
        actor_type="user",
        actor_id=user.email,
        subject_type="credential",
        subject_id=credential.id,
        payload={"identity": identity.principal, "ttl_days": ttl_days},
    )
    # Shown once, never stored in plaintext.
    return {
        "credential_id": credential.id,
        "key": raw,
        "expires_at": _iso(credential.expires_at),
        "note": "This key is shown once and cannot be retrieved again.",
    }


@router.post("/identities/{identity_id}/rotate")
def rotate(
    identity_id: str,
    overlap_hours: int = 24,
    session: Session = Depends(db),
    user: User = Depends(require("identity")),
) -> dict[str, Any]:
    identity = session.get(Identity, identity_id)
    if identity is None:
        raise HTTPException(404, "unknown identity")
    credential, raw = rotate_credential(session, identity, overlap_hours)
    chain.append(
        session,
        "credential.rotated",
        actor_type="user",
        actor_id=user.email,
        subject_type="credential",
        subject_id=credential.id,
        payload={"identity": identity.principal, "overlap_hours": overlap_hours},
    )
    return {"credential_id": credential.id, "key": raw, "overlap_hours": overlap_hours}


@router.post("/credentials/{credential_id}/revoke")
def revoke(
    credential_id: str, session: Session = Depends(db), user: User = Depends(require("identity"))
) -> dict[str, Any]:
    if not revoke_credential(session, credential_id):
        raise HTTPException(404, "unknown credential")
    chain.append(
        session,
        "credential.revoked",
        actor_type="user",
        actor_id=user.email,
        subject_type="credential",
        subject_id=credential_id,
        payload={},
    )
    return {"revoked": credential_id}


class CapabilityIn(BaseModel):
    tool_key: str
    actions: list[str] = Field(default_factory=lambda: ["*"])
    constraints: dict[str, Any] = Field(default_factory=dict)
    requires_approval: bool = False
    max_taint: str = "user"


@router.post("/identities/{identity_id}/capabilities", status_code=201)
def add_capability(
    identity_id: str,
    payload: CapabilityIn,
    session: Session = Depends(db),
    user: User = Depends(require("identity")),
) -> dict[str, Any]:
    identity = session.get(Identity, identity_id)
    if identity is None:
        raise HTTPException(404, "unknown identity")
    capability = grant_capability(
        session,
        identity,
        payload.tool_key,
        actions=payload.actions,
        constraints=payload.constraints,
        requires_approval=payload.requires_approval,
        max_taint=payload.max_taint,
        granted_by=user.email,
    )
    chain.append(
        session,
        "capability.granted",
        actor_type="user",
        actor_id=user.email,
        subject_type="capability",
        subject_id=capability.id,
        payload=payload.model_dump(),
    )
    return {"id": capability.id, "tool_key": capability.tool_key}


class CapabilityCheckIn(BaseModel):
    tool_key: str
    action: str = "*"
    arguments: dict[str, Any] = Field(default_factory=dict)
    argument_taint: dict[str, str] = Field(default_factory=dict)


@router.post("/identities/{identity_id}/check")
def check(
    identity_id: str,
    payload: CapabilityCheckIn,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    identity = session.get(Identity, identity_id)
    return check_capability(
        session,
        identity,
        payload.tool_key,
        payload.action,
        payload.arguments,
        payload.argument_taint,
    ).to_json()


class DelegateIn(BaseModel):
    parent_identity_id: str
    child_identity_id: str
    trace_id: str | None = None


@router.post("/identities/delegate", status_code=201)
def create_delegation(
    payload: DelegateIn, session: Session = Depends(db), user: User = Depends(require("identity"))
) -> dict[str, Any]:
    parent = session.get(Identity, payload.parent_identity_id)
    child = session.get(Identity, payload.child_identity_id)
    if parent is None or child is None:
        raise HTTPException(404, "unknown identity")
    try:
        edge = delegate(session, parent, child, payload.trace_id)
    except ValueError as exc:
        # Widening is rejected at write time (P2-5), not audited afterwards.
        raise HTTPException(400, str(exc)) from exc
    chain.append(
        session,
        "identity.delegated",
        actor_type="user",
        actor_id=user.email,
        subject_type="delegation",
        subject_id=edge.id,
        payload=edge.capability_diff_json,
    )
    return {"id": edge.id, "diff": edge.capability_diff_json}


@router.get("/identities/posture")
def posture(session: Session = Depends(db), _user: User = Depends(current_user)) -> dict[str, Any]:
    findings = assess_posture(session)
    return {
        "findings": [
            {"type": f.type, "severity": f.severity, "title": f.title, "evidence": f.evidence_json}
            for f in findings
        ]
    }


# ---------------------------------------------------------------------------
# Approvals (P2-3)
# ---------------------------------------------------------------------------


@router.get("/approvals")
def list_approvals(
    status: str = "pending", session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    expire_stale_approvals(session)
    query = select(ApprovalRequest).order_by(ApprovalRequest.requested_at.desc())
    if status:
        query = query.where(ApprovalRequest.status == status)
    return {
        "approvals": [
            {
                "id": a.id,
                "agent_id": a.agent_id,
                "tool": a.tool_key,
                "arguments": a.arguments_json,
                "reason": a.reason,
                "status": a.status,
                "requested_at": _iso(a.requested_at),
                "expires_at": _iso(a.expires_at),
                "trace_id": a.trace_id,
                "decision_id": a.decision_id,
                "timeout_action": a.timeout_action,
            }
            for a in session.scalars(query)
        ]
    }


@router.get("/approvals/{approval_id}")
def get_approval(
    approval_id: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    approval = session.get(ApprovalRequest, approval_id)
    if approval is None:
        raise HTTPException(404, "unknown approval")
    return {
        "id": approval.id,
        "status": approval.status,
        "reason": approval.reason,
        "tool": approval.tool_key,
        "arguments": approval.arguments_json,
        "rationale": approval.resolution_rationale,
    }


class ApprovalDecision(BaseModel):
    rationale: str = ""


@router.post("/approvals/{approval_id}/approve")
def approve(
    approval_id: str,
    payload: ApprovalDecision,
    session: Session = Depends(db),
    user: User = Depends(require("approvals")),
) -> dict[str, Any]:
    return _resolve(session, approval_id, True, user, payload.rationale)


@router.post("/approvals/{approval_id}/deny")
def deny(
    approval_id: str,
    payload: ApprovalDecision,
    session: Session = Depends(db),
    user: User = Depends(require("approvals")),
) -> dict[str, Any]:
    return _resolve(session, approval_id, False, user, payload.rationale)


def _resolve(
    session: Session, approval_id: str, approved: bool, user: User, rationale: str
) -> dict[str, Any]:
    approval = resolve_approval(session, approval_id, approved, user.id, rationale)
    if approval is None:
        raise HTTPException(404, "unknown approval")
    chain.append(
        session,
        f"approval.{approval.status}",
        actor_type="user",
        actor_id=user.email,
        subject_type="approval",
        subject_id=approval.id,
        payload={"tool": approval.tool_key, "rationale": rationale, "reason": approval.reason},
    )
    return {"id": approval.id, "status": approval.status, "resolver": user.email}


def _iso(value: dt.datetime | None) -> str | None:
    if value is None:
        return None
    return (value.replace(tzinfo=dt.UTC) if value.tzinfo is None else value).isoformat()


# ---------------------------------------------------------------------------
# Kill switch & quarantine (PL-3)
# ---------------------------------------------------------------------------


class ControlIn(BaseModel):
    reason: str = ""


@router.get("/controls")
def list_controls(
    session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    return {"controls": all_controls(session)}


@router.post("/agents/{slug}/quarantine")
def quarantine_agent(
    slug: str,
    payload: ControlIn,
    session: Session = Depends(db),
    user: User = Depends(require("registry")),
) -> dict[str, Any]:
    """Stop an agent while you investigate. Reversible and audited."""
    return _set_agent_state(session, slug, "quarantined", payload.reason, user)


@router.post("/agents/{slug}/kill")
def kill_agent(
    slug: str,
    payload: ControlIn,
    session: Session = Depends(db),
    user: User = Depends(require("identity")),
) -> dict[str, Any]:
    """Stop an agent now. Requires the stronger role — this is an incident action."""
    return _set_agent_state(session, slug, "killed", payload.reason, user)


@router.post("/agents/{slug}/resume")
def resume_agent(
    slug: str,
    payload: ControlIn,
    session: Session = Depends(db),
    user: User = Depends(require("identity")),
) -> dict[str, Any]:
    """Restart a stopped agent. Deliberately the same role as `kill` — restarting
    something that was stopped for cause is not a lesser decision than stopping it."""
    return _set_agent_state(session, slug, "active", payload.reason, user)


def _set_agent_state(
    session: Session, slug: str, state: str, reason: str, user: User
) -> dict[str, Any]:
    try:
        control = set_state(session, slug, state, reason=reason, actor=user.email)
    except UnknownAgent as exc:
        raise HTTPException(404, str(exc)) from exc
    return {
        "agent": slug,
        "state": control.state,
        "previous_state": control.previous_state,
        "reason": control.reason,
        "actor": control.actor,
        "changed_at": _iso(control.changed_at),
    }
