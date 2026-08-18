"""Persistence model for all six pillars.

Implements Appendix D. Three invariants are enforced here in code rather than by
convention, because they are the ones an auditor tests:

  * ``AuditEntry`` is append-only and hash-chained (P5-2). There is no update or
    delete path anywhere in the codebase.
  * ``PolicyVersion`` is immutable; every ``Decision`` binds the exact version in
    force at decision time (X-4).
  * ``Capability`` narrowing on delegation is validated at write time, not audited
    after the fact (P2-5).
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from . import ids


def utcnow() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


class Base(DeclarativeBase):
    type_annotation_map = {dict[str, Any]: JSON, list[str]: JSON, list[Any]: JSON}


class TimestampMixin:
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    org_id: Mapped[str] = mapped_column(String(64), default="org_default", index=True)


# ---------------------------------------------------------------------------
# Pillar 1 — Discovery & Agent Registry
# ---------------------------------------------------------------------------


class Agent(Base, TimestampMixin):
    """P1-1, P1-4. Created by explicit registration or on first observation."""

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.agent_id)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    purpose: Mapped[str] = mapped_column(Text, default="")
    owner_email: Mapped[str | None] = mapped_column(String(200))
    owner_team: Mapped[str | None] = mapped_column(String(120))
    environment: Mapped[str] = mapped_column(String(32), default="production")
    # EU AI Act aligned tiering (P6-3).
    risk_tier: Mapped[str] = mapped_column(String(24), default="limited")
    framework: Mapped[str | None] = mapped_column(String(64))  # P1-6, auto-detected
    status: Mapped[str] = mapped_column(String(24), default="active")
    registered: Mapped[bool] = mapped_column(Boolean, default=True)
    declared_models: Mapped[list[str]] = mapped_column(JSON, default=list)
    declared_tools: Mapped[list[str]] = mapped_column(JSON, default=list)
    data_classes: Mapped[list[str]] = mapped_column(JSON, default=list)
    first_seen_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    identities: Mapped[list[Identity]] = relationship(back_populates="agent")

    @property
    def is_owned(self) -> bool:
        """An unowned agent is a reportable compliance finding (P1-4)."""
        return bool(self.owner_email)


class AgentControl(Base, TimestampMixin):
    """PL-3 — kill switch and quarantine.

    Checked before anything else in the request path. Two states beyond `active`:

    * ``quarantined`` — the agent may not act. Every request is blocked, but the
      record is kept and the agent can be resumed. This is the state you want during
      an investigation.
    * ``killed`` — the same block, with the stronger operational meaning. Kept
      separate because "we are looking into it" and "stop this now" are different
      conversations, and an auditor will ask which one was declared.

    Both are reversible and both are audited. An irreversible kill switch is one
    nobody dares use.
    """

    __tablename__ = "agent_controls"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("ctr"))
    agent_id: Mapped[str] = mapped_column(
        String(40), ForeignKey("agents.id"), unique=True, index=True
    )
    state: Mapped[str] = mapped_column(String(24), default="active")
    reason: Mapped[str | None] = mapped_column(Text)
    actor: Mapped[str | None] = mapped_column(String(120))
    changed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    previous_state: Mapped[str | None] = mapped_column(String(24))

    @property
    def blocking(self) -> bool:
        return self.state in ("quarantined", "killed")


class Tool(Base, TimestampMixin):
    __tablename__ = "tools"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.tool_id)
    key: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    kind: Mapped[str] = mapped_column(String(32), default="function")
    # The axis policy reasons over. `irreversible` is the class that warrants HITL.
    impact: Mapped[str] = mapped_column(String(24), default="read")
    schema_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    mcp_server_id: Mapped[str | None] = mapped_column(String(40))
    description: Mapped[str] = mapped_column(Text, default="")


class McpServer(Base, TimestampMixin):
    __tablename__ = "mcp_servers"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.mcp_id)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    url: Mapped[str] = mapped_column(String(500), default="")
    transport: Mapped[str] = mapped_column(String(32), default="stdio")
    pinned_version: Mapped[str | None] = mapped_column(String(64))
    trust_level: Mapped[str] = mapped_column(String(24), default="untrusted")
    last_scanned_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class McpToolSnapshot(Base, TimestampMixin):
    """P1-5. Consecutive digests differing => schema drift finding."""

    __tablename__ = "mcp_tool_snapshots"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("mts"))
    mcp_server_id: Mapped[str] = mapped_column(String(40), ForeignKey("mcp_servers.id"), index=True)
    captured_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    tools_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    digest: Mapped[str] = mapped_column(String(64))


class LineageEdge(Base, TimestampMixin):
    """P1-3. Derived from observed spans, not declared config."""

    __tablename__ = "lineage_edges"
    __table_args__ = (UniqueConstraint("src_id", "dst_id", "relation", name="uq_lineage_edge"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("lin"))
    src_type: Mapped[str] = mapped_column(String(32))
    src_id: Mapped[str] = mapped_column(String(120), index=True)
    dst_type: Mapped[str] = mapped_column(String(32))
    dst_id: Mapped[str] = mapped_column(String(120), index=True)
    relation: Mapped[str] = mapped_column(String(32))
    observed_count: Mapped[int] = mapped_column(Integer, default=0)
    declared: Mapped[bool] = mapped_column(Boolean, default=False)
    first_observed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_observed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Finding(Base, TimestampMixin):
    """The cross-pillar queue. Everything that needs a human eventually lands here."""

    __tablename__ = "findings"
    __table_args__ = (Index("ix_findings_triage", "status", "severity", "created_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.finding_id)
    type: Mapped[str] = mapped_column(String(48), index=True)
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    status: Mapped[str] = mapped_column(String(16), default="open")
    title: Mapped[str] = mapped_column(String(300), default="")
    subject_type: Mapped[str] = mapped_column(String(32), default="agent")
    subject_id: Mapped[str | None] = mapped_column(String(120), index=True)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    control_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    suppression_reason: Mapped[str | None] = mapped_column(Text)
    suppressed_by: Mapped[str | None] = mapped_column(String(120))
    resolved_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# Pillar 2 — Identity, Access & Authorization
# ---------------------------------------------------------------------------


class Identity(Base, TimestampMixin):
    """P2-1. The governed non-human identity."""

    __tablename__ = "identities"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.identity_id)
    agent_id: Mapped[str | None] = mapped_column(String(40), ForeignKey("agents.id"), index=True)
    principal: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(24), default="agent")
    status: Mapped[str] = mapped_column(String(24), default="active")
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    posture: Mapped[str] = mapped_column(String(24), default="healthy")

    agent: Mapped[Agent | None] = relationship(back_populates="identities")
    capabilities: Mapped[list[Capability]] = relationship(back_populates="identity")
    credentials: Mapped[list[Credential]] = relationship(back_populates="identity")


class Credential(Base, TimestampMixin):
    __tablename__ = "credentials"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.credential_id)
    identity_id: Mapped[str] = mapped_column(String(40), ForeignKey("identities.id"), index=True)
    key_prefix: Mapped[str] = mapped_column(String(32), index=True)
    key_hash: Mapped[str] = mapped_column(String(256))
    issued_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    rotated_from_id: Mapped[str | None] = mapped_column(String(40))
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    identity: Mapped[Identity] = relationship(back_populates="credentials")

    @property
    def active(self) -> bool:
        if self.revoked_at:
            return False
        if self.expires_at and self.expires_at < utcnow():
            return False
        return True


class Capability(Base, TimestampMixin):
    """P2-2. Tool-scoped least privilege with argument-level constraints."""

    __tablename__ = "capabilities"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.capability_id)
    identity_id: Mapped[str] = mapped_column(String(40), ForeignKey("identities.id"), index=True)
    tool_key: Mapped[str] = mapped_column(String(160))  # glob allowed
    actions: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["*"])
    constraints_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    # P3-4: the highest taint level permitted to reach this tool's arguments.
    max_taint: Mapped[str] = mapped_column(String(24), default="user")
    granted_by: Mapped[str | None] = mapped_column(String(120))
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    identity: Mapped[Identity] = relationship(back_populates="capabilities")


class DelegationEdge(Base, TimestampMixin):
    """P2-5. Write-time invariant: child capabilities are a subset of the parent's."""

    __tablename__ = "delegation_edges"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("dlg"))
    parent_identity_id: Mapped[str] = mapped_column(String(40), index=True)
    child_identity_id: Mapped[str] = mapped_column(String(40), index=True)
    capability_diff_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    trace_id: Mapped[str | None] = mapped_column(String(40), index=True)


class ApprovalRequest(Base, TimestampMixin):
    """P2-3. Deny-on-timeout by default."""

    __tablename__ = "approval_requests"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.approval_id)
    decision_id: Mapped[str | None] = mapped_column(String(40), index=True)
    trace_id: Mapped[str | None] = mapped_column(String(40), index=True)
    agent_id: Mapped[str | None] = mapped_column(String(40), index=True)
    tool_key: Mapped[str | None] = mapped_column(String(160))
    arguments_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    reason: Mapped[str] = mapped_column(Text, default="")
    requested_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    approver_role: Mapped[str] = mapped_column(String(32), default="security")
    resolver_user_id: Mapped[str | None] = mapped_column(String(40))
    resolution_rationale: Mapped[str | None] = mapped_column(Text)
    timeout_action: Mapped[str] = mapped_column(String(16), default="deny")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.user_id)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(32), default="developer")
    # OIDC/SAML seam (P2-4). Populated by an IdP when one is wired.
    external_id: Mapped[str | None] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class ApiToken(Base, TimestampMixin):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("tok"))
    user_id: Mapped[str] = mapped_column(String(40), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    key_prefix: Mapped[str] = mapped_column(String(32), index=True)
    key_hash: Mapped[str] = mapped_column(String(256))
    expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# Pillar 3 — Runtime Guardrails
# ---------------------------------------------------------------------------


class DetectorRun(Base, TimestampMixin):
    """status=timeout|skipped_budget is the P3-6 degradation signal (NOM-RTG-06)."""

    __tablename__ = "detector_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.detector_run_id)
    trace_id: Mapped[str | None] = mapped_column(String(40), index=True)
    span_id: Mapped[str | None] = mapped_column(String(40))
    detector_key: Mapped[str] = mapped_column(String(64), index=True)
    detector_version: Mapped[str] = mapped_column(String(32), default="0")
    surface: Mapped[str] = mapped_column(String(24), default="input")
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(24), default="ok")
    score: Mapped[float] = mapped_column(Float, default=0.0)
    raw_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class DetectionFinding(Base, TimestampMixin):
    """`sample` is redacted at capture (P5-5) — we never store the raw secret."""

    __tablename__ = "detection_findings"
    __table_args__ = (Index("ix_detfind_entity", "entity_type", "created_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("dfn"))
    detector_run_id: Mapped[str] = mapped_column(String(40), index=True)
    trace_id: Mapped[str | None] = mapped_column(String(40), index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    start: Mapped[int] = mapped_column(Integer, default=0)
    end: Mapped[int] = mapped_column(Integer, default=0)
    sample: Mapped[str] = mapped_column(String(200), default="")
    action_taken: Mapped[str] = mapped_column(String(24), default="none")
    owasp_id: Mapped[str | None] = mapped_column(String(24))
    atlas_id: Mapped[str | None] = mapped_column(String(32))


class TaintTag(Base, TimestampMixin):
    """P3-4. The substrate for intent-based containment."""

    __tablename__ = "taint_tags"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("tnt"))
    trace_id: Mapped[str] = mapped_column(String(40), index=True)
    path: Mapped[str] = mapped_column(String(300))
    source: Mapped[str] = mapped_column(String(32))
    trust: Mapped[str] = mapped_column(String(16), default="untrusted")
    propagated_from: Mapped[str | None] = mapped_column(String(300))


class Budget(Base, TimestampMixin):
    """P3-10. Consumption bounds and loop containment."""

    __tablename__ = "budgets"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("bdg"))
    scope_type: Mapped[str] = mapped_column(String(24), default="agent")
    scope_id: Mapped[str] = mapped_column(String(120), index=True)
    window: Mapped[str] = mapped_column(String(24), default="hour")
    window_started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    max_calls: Mapped[int | None] = mapped_column(Integer)
    max_tokens: Mapped[int | None] = mapped_column(Integer)
    max_cost_usd: Mapped[float | None] = mapped_column(Float)
    max_depth: Mapped[int | None] = mapped_column(Integer)
    calls: Mapped[int] = mapped_column(Integer, default=0)
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)


# ---------------------------------------------------------------------------
# Pillar 4 — Evaluation & Reliability
# ---------------------------------------------------------------------------


class EvalSuite(Base, TimestampMixin):
    __tablename__ = "eval_suites"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.eval_id)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer, default=1)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)


class EvalCase(Base, TimestampMixin):
    __tablename__ = "eval_cases"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("cse"))
    suite_id: Mapped[str] = mapped_column(String(40), ForeignKey("eval_suites.id"), index=True)
    input_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    expected_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    context_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    labels: Mapped[list[str]] = mapped_column(JSON, default=list)
    split: Mapped[str] = mapped_column(String(24), default="test")
    # P4-6: "promote this production failure to a test case".
    source_trace_id: Mapped[str | None] = mapped_column(String(40))
    weight: Mapped[float] = mapped_column(Float, default=1.0)


class EvalRun(Base, TimestampMixin):
    __tablename__ = "eval_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.run_id)
    suite_id: Mapped[str] = mapped_column(String(40), index=True)
    target_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    scorer_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    baseline_run_id: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(24), default="pending")
    runner: Mapped[str] = mapped_column(String(24), default="native")
    mode: Mapped[str] = mapped_column(String(16), default="offline")  # offline | online
    started_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    code_version: Mapped[str] = mapped_column(String(40), default="")


class EvalResult(Base, TimestampMixin):
    __tablename__ = "eval_results"
    __table_args__ = (UniqueConstraint("run_id", "case_id", "scorer_key", name="uq_eval_result"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("res"))
    run_id: Mapped[str] = mapped_column(String(40), index=True)
    case_id: Mapped[str] = mapped_column(String(40), index=True)
    scorer_key: Mapped[str] = mapped_column(String(64))
    score: Mapped[float] = mapped_column(Float, default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, default=True)
    output_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    detail_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)


class Baseline(Base, TimestampMixin):
    """Regression gate semantics for P4-1 live here."""

    __tablename__ = "baselines"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("bsl"))
    suite_id: Mapped[str] = mapped_column(String(40), index=True)
    run_id: Mapped[str] = mapped_column(String(40))
    label: Mapped[str] = mapped_column(String(120), default="main")
    thresholds_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class DriftWindow(Base, TimestampMixin):
    __tablename__ = "drift_windows"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("drf"))
    agent_id: Mapped[str] = mapped_column(String(40), index=True)
    scorer_key: Mapped[str] = mapped_column(String(64))
    window_start: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    window_end: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    n: Mapped[int] = mapped_column(Integer, default=0)
    mean: Mapped[float] = mapped_column(Float, default=0.0)
    p50: Mapped[float] = mapped_column(Float, default=0.0)
    p95: Mapped[float] = mapped_column(Float, default=0.0)
    psi: Mapped[float | None] = mapped_column(Float)
    ks: Mapped[float | None] = mapped_column(Float)
    baseline_window_id: Mapped[str | None] = mapped_column(String(40))
    drifted: Mapped[bool] = mapped_column(Boolean, default=False)


class SLO(Base, TimestampMixin):
    __tablename__ = "slos"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("slo"))
    agent_id: Mapped[str] = mapped_column(String(40), index=True)
    scorer_key: Mapped[str] = mapped_column(String(64))
    objective: Mapped[str] = mapped_column(String(300), default="")
    window: Mapped[str] = mapped_column(String(24), default="7d")
    target: Mapped[float] = mapped_column(Float, default=0.9)
    current: Mapped[float | None] = mapped_column(Float)
    error_budget_remaining: Mapped[float | None] = mapped_column(Float)


class RedTeamCampaign(Base, TimestampMixin):
    __tablename__ = "redteam_campaigns"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("rtc"))
    name: Mapped[str] = mapped_column(String(200), default="")
    runner: Mapped[str] = mapped_column(String(24), default="native")
    probes: Mapped[list[str]] = mapped_column(JSON, default=list)
    target_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="pending")
    summary_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class RedTeamFinding(Base, TimestampMixin):
    __tablename__ = "redteam_findings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("rtf"))
    campaign_id: Mapped[str] = mapped_column(String(40), index=True)
    probe: Mapped[str] = mapped_column(String(120))
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    succeeded: Mapped[bool] = mapped_column(Boolean, default=False)
    owasp_id: Mapped[str | None] = mapped_column(String(24))
    atlas_id: Mapped[str | None] = mapped_column(String(32))
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


# ---------------------------------------------------------------------------
# Pillar 5 — Audit, Observability & Traceability
# ---------------------------------------------------------------------------


class Trace(Base, TimestampMixin):
    __tablename__ = "traces"
    __table_args__ = (Index("ix_traces_agent_time", "agent_id", "started_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.trace_id)
    agent_id: Mapped[str | None] = mapped_column(String(40), index=True)
    agent_slug: Mapped[str | None] = mapped_column(String(120), index=True)
    session_id: Mapped[str | None] = mapped_column(String(120), index=True)
    environment: Mapped[str] = mapped_column(String(32), default="production")
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(24), default="ok")
    verdict: Mapped[str] = mapped_column(String(16), default="allow", index=True)
    intent: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(String(120))
    provider: Mapped[str | None] = mapped_column(String(64))
    token_usage_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)


class TraceLink(Base, TimestampMixin):
    """I-4 / I-6 — the join key between our decision and an external observability run.

    Deliberately a link table and not a copy of their span data. Their trace store is
    better than ours; duplicating it would make us a worse LangSmith. What nobody has
    is the *join*, so that is the only thing we keep.
    """

    __tablename__ = "trace_links"
    __table_args__ = (
        Index("ix_trace_links_external", "system", "external_trace_id"),
        Index("ix_trace_links_run", "system", "external_run_id"),
    )

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.trace_link_id)
    trace_id: Mapped[str] = mapped_column(String(40), index=True)
    system: Mapped[str] = mapped_column(String(32))  # langsmith | langfuse | otel
    external_trace_id: Mapped[str] = mapped_column(String(200))
    external_run_id: Mapped[str | None] = mapped_column(String(200))
    project: Mapped[str | None] = mapped_column(String(200))
    url: Mapped[str | None] = mapped_column(Text)
    # inbound: they called us and carried the id. outbound: we created the id.
    direction: Mapped[str] = mapped_column(String(16), default="inbound")


class Span(Base, TimestampMixin):
    """OpenLLMetry semantic conventions live in `attributes_json` (P5-1)."""

    __tablename__ = "spans"
    __table_args__ = (Index("ix_spans_trace_time", "trace_id", "started_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.span_id)
    trace_id: Mapped[str] = mapped_column(String(40), index=True)
    parent_span_id: Mapped[str | None] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(24), default="llm")
    name: Mapped[str] = mapped_column(String(200), default="")
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ended_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[float] = mapped_column(Float, default=0.0)
    attributes_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="ok")
    error: Mapped[str | None] = mapped_column(Text)


class AuditEntry(Base):
    """P5-2. Append-only, hash-chained.

    There is intentionally no ``updated_at``, no ORM update path, and no delete
    endpoint. The chain is verified by :mod:`nometria.audit.chain`, which is a pure
    function over exported rows so a third party can run it without our systems.
    """

    __tablename__ = "audit_entries"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("aud"))
    org_id: Mapped[str] = mapped_column(String(64), default="org_default", index=True)
    seq: Mapped[int] = mapped_column(Integer, unique=True, index=True)
    occurred_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    actor_type: Mapped[str] = mapped_column(String(24), default="system")
    actor_id: Mapped[str | None] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(64), index=True)
    subject_type: Mapped[str] = mapped_column(String(32), default="")
    subject_id: Mapped[str | None] = mapped_column(String(120), index=True)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    payload_digest: Mapped[str] = mapped_column(String(64))
    prev_digest: Mapped[str] = mapped_column(String(64))
    digest: Mapped[str] = mapped_column(String(64))


class AuditCheckpoint(Base, TimestampMixin):
    """Signed anchor. The key lives outside the application database (NFR-7)."""

    __tablename__ = "audit_checkpoints"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("ckp"))
    seq: Mapped[int] = mapped_column(Integer, index=True)
    digest: Mapped[str] = mapped_column(String(64))
    signed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    signature: Mapped[str] = mapped_column(String(128))
    key_id: Mapped[str] = mapped_column(String(64), default="local")


class EvidencePackage(Base, TimestampMixin):
    __tablename__ = "evidence_packages"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.evidence_id)
    scope_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    requested_by: Mapped[str] = mapped_column(String(120), default="")
    built_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    manifest_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    chain_verification_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    code_version: Mapped[str] = mapped_column(String(40), default="")
    catalog_version: Mapped[str] = mapped_column(String(40), default="")
    path: Mapped[str] = mapped_column(String(500), default="")


class RetentionPolicy(Base, TimestampMixin):
    __tablename__ = "retention_policies"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("ret"))
    data_class: Mapped[str] = mapped_column(String(64), unique=True)
    retain_days: Mapped[int] = mapped_column(Integer, default=365)
    redact_fields: Mapped[list[str]] = mapped_column(JSON, default=list)


class LegalHold(Base, TimestampMixin):
    __tablename__ = "legal_holds"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("hld"))
    scope_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    reason: Mapped[str] = mapped_column(Text, default="")
    placed_by: Mapped[str] = mapped_column(String(120), default="")
    placed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    released_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


# ---------------------------------------------------------------------------
# Pillar 6 — Policy & Compliance
# ---------------------------------------------------------------------------


class Policy(Base, TimestampMixin):
    __tablename__ = "policies"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.policy_id)
    key: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(24), default="declarative")  # declarative | rego
    owner: Mapped[str | None] = mapped_column(String(120))


class PolicyVersion(Base, TimestampMixin):
    """Immutable. Never mutated in place — X-4."""

    __tablename__ = "policy_versions"
    __table_args__ = (UniqueConstraint("policy_id", "version", name="uq_policy_version"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.policy_version_id)
    policy_id: Mapped[str] = mapped_column(String(40), ForeignKey("policies.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    body: Mapped[str] = mapped_column(Text, default="")
    compiled_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    author: Mapped[str | None] = mapped_column(String(120))
    notes: Mapped[str] = mapped_column(Text, default="")


class PolicyBinding(Base, TimestampMixin):
    """Observe-by-default is the R3 (false-block) mitigation."""

    __tablename__ = "policy_bindings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("bnd"))
    policy_version_id: Mapped[str] = mapped_column(String(40), index=True)
    scope_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    mode: Mapped[str] = mapped_column(String(16), default="observe")
    # P12 — where this binding sits in the hierarchy. Defaults keep pre-hierarchy
    # bindings behaving exactly as before: one org-wide layer that extends nothing.
    level: Mapped[str] = mapped_column(String(16), default="org")
    scope_id: Mapped[str] = mapped_column(String(160), default="*")
    compose: Mapped[str] = mapped_column(String(16), default="extend")
    effective_from: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    effective_to: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class Decision(Base, TimestampMixin):
    __tablename__ = "decisions"
    __table_args__ = (Index("ix_decisions_agent_verdict", "agent_id", "verdict", "created_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=ids.decision_id)
    trace_id: Mapped[str | None] = mapped_column(String(40), index=True)
    span_id: Mapped[str | None] = mapped_column(String(40))
    agent_id: Mapped[str | None] = mapped_column(String(40), index=True)
    identity_id: Mapped[str | None] = mapped_column(String(40))
    surface: Mapped[str] = mapped_column(String(24), default="input")
    tool_key: Mapped[str | None] = mapped_column(String(160))
    verdict: Mapped[str] = mapped_column(String(16), default="allow", index=True)
    rules_fired_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    # Always the exact version(s) in force at decision time — X-4, NOM-AUD-02.
    # `policy_version_id` is the version that produced the winning verdict;
    # `policy_version_ids` is every version evaluated, because a decision is only
    # reproducible if you know the whole set that was in force, not just the winner.
    policy_version_id: Mapped[str | None] = mapped_column(String(40))
    policy_version_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    detector_run_ids: Mapped[list[str]] = mapped_column(JSON, default=list)
    taint_summary_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    mode: Mapped[str] = mapped_column(String(16), default="observe")
    approval_id: Mapped[str | None] = mapped_column(String(40))


class SimulationRun(Base, TimestampMixin):
    """P2-7. Replay recorded traffic against a candidate policy."""

    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("sim"))
    policy_id: Mapped[str | None] = mapped_column(String(40))
    candidate_body: Mapped[str] = mapped_column(Text, default="")
    scope_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    replayed_count: Mapped[int] = mapped_column(Integer, default=0)
    diff_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    run_by: Mapped[str] = mapped_column(String(120), default="")


class Control(Base, TimestampMixin):
    __tablename__ = "controls"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("ctl"))
    key: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(300))
    objective: Mapped[str] = mapped_column(Text, default="")
    family: Mapped[str] = mapped_column(String(16))
    pillar: Mapped[int] = mapped_column(Integer)
    implemented_by: Mapped[list[str]] = mapped_column(JSON, default=list)
    evidence_sources: Mapped[list[str]] = mapped_column(JSON, default=list)
    status_rule_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    catalog_version: Mapped[str] = mapped_column(String(32), default="0.1.0-draft")


class FrameworkMapping(Base, TimestampMixin):
    """`draft` mappings are excluded from evidence packages (Appendix B §B.6)."""

    __tablename__ = "framework_mappings"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("fmp"))
    control_key: Mapped[str] = mapped_column(String(32), index=True)
    framework: Mapped[str] = mapped_column(String(32), index=True)
    reference: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, default="")
    review_status: Mapped[str] = mapped_column(String(16), default="draft")
    reviewed_by: Mapped[str | None] = mapped_column(String(120))
    reviewed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


class ControlStatus(Base, TimestampMixin):
    """P6-4. Computed from telemetry, never attested."""

    __tablename__ = "control_statuses"
    __table_args__ = (Index("ix_ctlstatus_key_time", "control_key", "computed_at"),)

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("cst"))
    control_key: Mapped[str] = mapped_column(String(32), index=True)
    scope_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="not_implemented")
    computed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    evidence_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rationale: Mapped[str] = mapped_column(Text, default="")


class RiskAssessment(Base, TimestampMixin):
    __tablename__ = "risk_assessments"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("rsk"))
    agent_id: Mapped[str] = mapped_column(String(40), index=True)
    eu_ai_act_class: Mapped[str] = mapped_column(String(24), default="limited")
    inherent_risk: Mapped[str] = mapped_column(String(16), default="medium")
    residual_risk: Mapped[str] = mapped_column(String(16), default="medium")
    mitigations_json: Mapped[list[Any]] = mapped_column(JSON, default=list)
    answers_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    assessor: Mapped[str] = mapped_column(String(120), default="")
    assessed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    next_review_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    signed_off_by: Mapped[str | None] = mapped_column(String(120))


class Obligation(Base, TimestampMixin):
    """P6-5. The regulatory clock, as data rather than code (R6)."""

    __tablename__ = "obligations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: ids.new_id("obl"))
    framework: Mapped[str] = mapped_column(String(32), index=True)
    reference: Mapped[str] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    effective_date: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True))
    applies_when_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(24), default="upcoming")


__all__ = [n for n in dir() if n[0].isupper()]
