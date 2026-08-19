"""The enforcement orchestrator — PRD §9.3, the request path.

This is where the six pillars stop being separate modules and become one product.
Every inline surface (gateway proxy, direct guard endpoints, SDK, red-team runner)
goes through this class, which is what makes the guarantees hold uniformly:

    identity resolution (P1-2, P2-1)
      -> taint annotation (P3-4)
      -> budgeted detector pipeline (P3-1/2/3/5, P3-6)
      -> capability check (P2-2)
      -> policy decision (P6-1)
      -> escalation to a human (P2-3)
      -> provider call (X-2)
      -> post-flight on the response (P3-2, P3-9, P4-3)
      -> trace, audit chain, findings (P5-1, P5-2)

Two invariants are enforced here rather than assumed:

* **No block without a reason.** Every verdict carries the rule that produced it and
  a human-readable explanation (principle X-4). A guardrail that blocks silently is
  a bug, not a strict configuration.
* **Observe by default.** Enforcement is something a customer turns on deliberately,
  after simulating it. A tool that starts blocking the moment it is installed gets
  uninstalled the same week (PRD R3).
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .answerability import (
    classify_answerability,
    detect_over_refusal,
    get_boundary,
    verify_boundary,
)
from .audit import chain
from .audit.trace import (
    ATTR_AGENT,
    ATTR_REQUEST_MODEL,
    ATTR_SYSTEM,
    ATTR_TAINT,
    ATTR_TOOL_IMPACT,
    ATTR_TOOL_NAME,
    ATTR_VERDICT,
    add_span,
    end_trace,
    start_trace,
)
from .config import get_settings
from .guardrails import (
    DetectionContext,
    DetectorPipeline,
    TaintTracker,
    redact_content,
)
from .guardrails.actions import analyse_arguments
from .guardrails.actions import summarise as summarise_actions
from .guardrails.base import taint_rank
from .guardrails.taint import _flatten
from .guardrails.tuning import (
    LatencyLedger,
    active_suppressions,
    explain,
    filter_suppressed,
)
from .identity import check_capability, request_approval, verify_credential
from .integrations.correlation import (
    link_trace,
    push_verdict,
    refs_from_env,
    refs_from_headers,
)
from .integrity import assess_integrity
from .models import (
    Agent,
    Budget,
    Decision,
    DetectionFinding,
    DetectorRun,
    Finding,
    Identity,
    TaintTag,
    Tool,
    Trace,
    utcnow,
)
from .policy import PolicyInput, active_policies, combine, get_engine
from .provenance import assess_provenance
from .providers import CompletionRequest, get_provider
from .registry.service import observe_agent, record_edge
from .reliability import (
    BREAKER,
    BudgetVerdict,
    DegradationRecord,
    FallbackLadder,
    ProviderAttempt,
    check_budget,
    raise_budget_finding,
)
from .reliability import Rung as _Rung


class ProviderUnavailable(RuntimeError):
    """Every provider on the fallback ladder failed or is circuit-open."""


#: Verdict severity ordering, shared by every comparison in this module.
log = logging.getLogger(__name__)

_RANK = {"allow": 0, "tokenize": 1, "mask": 2, "redact": 3, "abstain": 4, "escalate": 5, "block": 6}


@dataclass
class EnforcementResult:
    verdict: str = "allow"
    effective_verdict: str = "allow"
    mode: str = "observe"
    decision_id: str | None = None
    trace_id: str | None = None
    approval_id: str | None = None
    policy_version_id: str | None = None
    rules_fired: list[dict[str, Any]] = field(default_factory=list)
    entities: list[str] = field(default_factory=list)
    findings: list[dict[str, Any]] = field(default_factory=list)
    taint: dict[str, Any] = field(default_factory=dict)
    latency_ms: float = 0.0
    degraded: list[str] = field(default_factory=list)
    content: str | None = None  # redacted content, when the verdict is a redaction
    reason: str = ""
    # P3-12/13/14. `explanation` is what an engineer reads instead of "blocked by
    # policy"; `suppressed` records exceptions that fired, because an exception that
    # leaves no trace is a hole rather than a control.
    explanation: dict[str, Any] = field(default_factory=dict)
    suppressed: list[dict[str, Any]] = field(default_factory=list)
    latency_budget: dict[str, Any] = field(default_factory=dict)

    @property
    def blocked(self) -> bool:
        return self.verdict == "block"

    @property
    def escalated(self) -> bool:
        return self.verdict == "escalate"

    def to_json(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "effective_verdict": self.effective_verdict,
            "mode": self.mode,
            "decision_id": self.decision_id,
            "trace_id": self.trace_id,
            "approval_id": self.approval_id,
            "policy_version": self.policy_version_id,
            "rules_fired": self.rules_fired,
            "entities": self.entities,
            "findings": self.findings,
            "taint": self.taint,
            "latency_ms": round(self.latency_ms, 2),
            "degraded": self.degraded,
            "reason": self.reason,
            "explanation": self.explanation,
            "suppressed": self.suppressed,
            "latency_budget": self.latency_budget,
        }


@dataclass
class PreflightOutcome:
    """Everything the pre-flight established, shared by the buffered and streaming paths."""

    agent: Agent | None = None
    identity: Identity | None = None
    trace: Trace | None = None
    tracker: TaintTracker | None = None
    messages: list[dict[str, Any]] = field(default_factory=list)
    result: EnforcementResult = field(default_factory=EnforcementResult)
    stopped: bool = False


@dataclass
class StreamEvent:
    """One event on the enforced stream.

    ``kind`` is one of:
      ``delta``   — content to forward to the caller
      ``blocked`` — enforcement stopped the stream; ``result`` explains why
      ``done``    — the stream completed; ``result`` carries the final verdict
    """

    kind: str = "delta"
    delta: str = ""
    finish_reason: str | None = None
    usage: dict[str, int] = field(default_factory=dict)
    result: EnforcementResult | None = None


class Enforcer:
    def __init__(self, session: Session, pipeline: DetectorPipeline | None = None) -> None:
        self.session = session
        self.settings = get_settings()
        self.pipeline = pipeline or DetectorPipeline()
        self.engine = get_engine()
        # P3-13: one ledger per request, not per call. Reset at the start of each
        # governed completion; a bare `evaluate()` gets a fresh one on demand.
        self._ledger: LatencyLedger | None = None
        # F2/F7: the retrieval set, records and entities the answer was built from.
        # Set by the caller (SDK, LangGraph guard, gateway) before a governed call.
        self.evidence: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # Identity & agent resolution
    # ------------------------------------------------------------------

    def resolve(
        self,
        agent_slug: str | None,
        credential: str | None = None,
        environment: str = "production",
        model: str | None = None,
        framework: str | None = None,
    ) -> tuple[Agent | None, Identity | None, bool]:
        identity = verify_credential(self.session, credential) if credential else None
        if identity is not None and identity.agent_id and not agent_slug:
            agent = self.session.get(Agent, identity.agent_id)
            if agent is not None:
                agent.last_seen_at = utcnow()
                return agent, identity, False

        if not agent_slug:
            return None, identity, False

        agent, is_shadow = observe_agent(
            self.session,
            agent_slug,
            environment=environment,
            model=model,
            framework=framework,
        )
        if identity is None:
            identity = self.session.scalar(select(Identity).where(Identity.agent_id == agent.id))
        return agent, identity, is_shadow

    # ------------------------------------------------------------------
    # Core evaluation
    # ------------------------------------------------------------------

    def ledger(self) -> LatencyLedger:
        """The request-level detector budget (P3-13)."""
        if self._ledger is None:
            self._ledger = LatencyLedger(budget_ms=self.settings.request_budget_ms)
        return self._ledger

    def reset_ledger(self) -> LatencyLedger:
        self._ledger = LatencyLedger(budget_ms=self.settings.request_budget_ms)
        return self._ledger

    def evaluate(
        self,
        *,
        agent: Agent | None,
        identity: Identity | None,
        content: str,
        surface: str,
        trace: Trace | None = None,
        taint_source: str = "user",
        tool_key: str | None = None,
        arguments: dict[str, Any] | None = None,
        argument_taint: dict[str, str] | None = None,
        intent: str | None = None,
        schema: dict[str, Any] | None = None,
        prior_tools: list[str] | None = None,
        tracker: TaintTracker | None = None,
        persist: bool = True,
    ) -> EnforcementResult:
        """One decision on one surface. The single point every guarantee flows through."""
        started = time.perf_counter()
        agent_slug = agent.slug if agent else None
        environment = agent.environment if agent else "production"
        trace_id = trace.id if trace else None

        tool = self.session.scalar(select(Tool).where(Tool.key == tool_key)) if tool_key else None
        tool_impact = tool.impact if tool else "read"

        # --- 4. detector pipeline (budgeted, concurrent) -----------------
        context = DetectionContext(
            surface=surface,
            agent_slug=agent_slug,
            trace_id=trace_id,
            tool_key=tool_key,
            tool_impact=tool_impact,
            intent=intent,
            taint_source=taint_source,
            schema=schema,
            prior_tools=prior_tools or [],
        )
        ledger = self.ledger()
        pipeline_result = self.pipeline.run(
            content, context, budget_ms=ledger.allowance_ms(self.pipeline.budget_ms)
        )
        ledger.charge(pipeline_result, surface)

        # P3-14: suppressions are applied here rather than inside the pipeline. A
        # suppression is a governance decision about a detector's output, not a
        # detector concern, and keeping it out of the pipeline means the raw detector
        # result stays honest.
        suppressions = active_suppressions(self.session, agent.id if agent else None)
        suppressed = filter_suppressed(pipeline_result, suppressions, surface=surface)

        detections = [
            {
                "entity_type": d.entity_type,
                "score": d.score,
                "owasp_id": d.owasp_id,
                "atlas_id": d.atlas_id,
            }
            for d in pipeline_result.detections
        ]

        detector_run_ids: list[str] = []
        if persist:
            detector_run_ids = self._persist_detectors(pipeline_result, trace_id, surface)

        # --- capability check (P2-2) -------------------------------------
        capability = {"granted": True, "requires_approval": False, "state": "granted"}
        if tool_key:
            decision = check_capability(
                self.session,
                identity,
                tool_key,
                arguments=arguments or {},
                argument_taint=argument_taint or {},
            )
            capability = decision.to_json()

        # --- P8/F7 evidence integrity (output surface only) ----------------
        # Groundedness asks whether the claim is supported by the text. It does not
        # ask whether the text was authoritative (F2), nor whether 5 + 3 = 9 (F7).
        # Both are properties of the answer's relationship to its evidence, so they
        # run here, where the evidence is in hand.
        evidence = self._evidence_checks(agent, surface, content, intent)

        # --- P9 action assurance ------------------------------------------
        # Argument-level containment governs *the call*; this governs *the artefact*.
        # An agent holding a legitimate `db.query` capability can pass `DROP TABLE` as
        # a well-formed string, and every argument check would pass it.
        action = (
            summarise_actions(
                analyse_arguments(arguments or {}, dialect=self.settings.sql_dialect),
                environment,
            )
            if arguments
            else {}
        )

        # --- budgets & loop containment (P3-10) --------------------------
        budget = self._budget_state(agent, trace, tool_key, prior_tools or [])

        taint_summary = tracker.summary() if tracker else {"max_source": taint_source}
        taint_summary = {
            **taint_summary,
            "arguments": argument_taint or {},
            "tool_impact": tool_impact,
            "risk_tier": agent.risk_tier if agent else "limited",
            "capability": capability,
            "budget": budget,
            "detections": detections,
            "prior_tools": prior_tools or [],
            "detector_degraded": bool(pipeline_result.degraded),
            "arguments_snapshot": arguments or {},
            "action": action,
            **evidence,
        }

        # --- 5. policy decision (P6-1) -----------------------------------
        pinput = PolicyInput(
            agent_slug=agent_slug,
            risk_tier=agent.risk_tier if agent else "limited",
            environment=environment,
            surface=surface,
            tool_key=tool_key,
            tool_impact=tool_impact,
            arguments=arguments or {},
            intent=intent,
            detections=detections,
            taint=taint_summary,
            capability=capability,
            budget=budget,
            prior_tools=prior_tools or [],
            detector_degraded=bool(pipeline_result.degraded),
            action=action,
        )

        bound = active_policies(self.session, agent_slug, environment)
        evaluated = [
            (doc, version, self.engine.evaluate(doc, pinput)) for doc, version, _b in bound
        ]
        merged = combine([d for _doc, _v, d in evaluated]) if evaluated else None

        # X-4: a decision is only reproducible if the *whole* set of versions in force
        # is recorded, not just the one that happened to win.
        policy_version_ids = [version.id for _doc, version, _d in evaluated]
        policy_version_id = next(
            (
                version.id
                for doc, version, _d in evaluated
                if merged and merged.policy_key == doc.key
            ),
            policy_version_ids[0] if policy_version_ids else None,
        )

        verdict = merged.verdict if merged else "allow"
        effective = merged.effective_verdict if merged else "allow"
        mode = merged.mode if merged else self.settings.default_policy_mode
        rules_fired = [r.to_json() for r in merged.rules_fired] if merged else []

        # A capability denial is not a policy opinion — it is the absence of a grant,
        # and it stands whether or not a policy happened to cover the case. The
        # synthetic rule is only added when no policy already said the same thing,
        # so a customer who wrote the rule explicitly does not see it twice.
        fired_ids = {r.get("rule_id") for r in rules_fired}
        if not capability.get("granted", True):
            verdict = "block"
            effective = "block"
            if "capability.denied" not in fired_ids:
                rules_fired.append(
                    {
                        "rule_id": "capability.default_deny",
                        "effect": "block",
                        "reason": "; ".join(capability.get("reasons") or ["no capability granted"]),
                        "severity": "high",
                        "controls": ["NOM-IAM-02"],
                    }
                )
        elif capability.get("requires_approval") and effective != "block":
            effective = "escalate"
            if mode == "enforce":
                verdict = "escalate"
            if "capability.approval_required" not in fired_ids:
                rules_fired.append(
                    {
                        "rule_id": "capability.requires_approval",
                        "effect": "escalate",
                        "reason": "; ".join(capability.get("reasons") or ["approval required"]),
                        "severity": "medium",
                        "controls": ["NOM-IAM-03"],
                    }
                )

        # F2/F7: an unauthoritative or arithmetically wrong answer is a finding, not
        # a block. Blocking here would withhold a mostly-correct answer over a
        # currency mismatch, and the failure this addresses is *silent* wrongness —
        # surfacing it is the control.
        for issue in evidence.get("evidence_issues", []):
            self.session.add(
                Finding(
                    type=issue["type"],
                    severity=issue.get("severity", "medium"),
                    title=issue["title"],
                    subject_type="agent",
                    subject_id=agent.id if agent else None,
                    evidence_json={**issue, "trace_id": trace_id},
                    control_keys=["NOM-RTG-12"],
                )
            )

        # P9: a critical action risk stands on its own, exactly as a capability denial
        # does. It is a fact about what the statement will do, not a policy opinion —
        # and a customer who wrote the rule explicitly does not see it twice.
        for risk in action.get("critical", []):
            if risk["code"] in fired_ids:
                continue
            verdict = "block"
            effective = "block"
            fired_ids.add(risk["code"])
            rules_fired.append(
                {
                    "rule_id": risk["code"],
                    "effect": "block",
                    "reason": risk["detail"],
                    "severity": "critical",
                    "controls": ["NOM-RTG-09"],
                    "evidence": risk.get("evidence", {}),
                }
            )

        # P3-7: a degraded pipeline means reduced coverage. Fail-closed converts that
        # into a block; fail-open accepts it and records the gap.
        if pipeline_result.degraded and self.settings.fail_mode == "closed" and mode == "enforce":
            verdict = "block"
            effective = "block"
            rules_fired.append(
                {
                    "rule_id": "pipeline.fail_closed",
                    "effect": "block",
                    "reason": f"detectors degraded ({pipeline_result.degraded}) and "
                    "fail_mode=closed",
                    "severity": "medium",
                    "controls": ["NOM-RTG-06"],
                }
            )

        latency_ms = (time.perf_counter() - started) * 1000
        reason = "; ".join(r.get("reason", "") for r in rules_fired if r.get("reason")) or (
            "no policy rule matched"
        )

        result = EnforcementResult(
            verdict=verdict,
            effective_verdict=effective,
            mode=mode,
            trace_id=trace_id,
            policy_version_id=policy_version_id,
            rules_fired=rules_fired,
            entities=sorted({d["entity_type"] for d in detections}),
            taint=taint_summary,
            latency_ms=latency_ms,
            degraded=pipeline_result.degraded,
            reason=reason,
            suppressed=suppressed,
            latency_budget=ledger.report(),
        )
        result.explanation = explain(
            result,
            pipeline_result,
            content=content,
            surface=surface,
        ).to_json()

        # --- redaction (applied to the content, not just recorded) -------
        if effective in ("redact", "mask", "tokenize") and pipeline_result.detections:
            style = next(
                (
                    r.get("redaction", "mask")
                    for r in rules_fired
                    if r.get("effect") in ("redact", "mask", "tokenize")
                ),
                "mask",
            )
            result.content = redact_content(
                content,
                [
                    d
                    for d in pipeline_result.detections
                    if d.entity_type.startswith(("PII", "SECRET"))
                ],
                mode="tokenize" if style == "tokenize" else "mask",
            )

        if not persist:
            return result

        # --- 9. persist decision, findings, audit ------------------------
        decision_row = Decision(
            trace_id=trace_id,
            agent_id=agent.id if agent else None,
            identity_id=identity.id if identity else None,
            surface=surface,
            tool_key=tool_key,
            verdict=verdict,
            rules_fired_json=rules_fired,
            policy_version_id=policy_version_id,
            policy_version_ids=policy_version_ids,
            detector_run_ids=detector_run_ids,
            taint_summary_json=taint_summary,
            latency_ms=latency_ms,
            mode=mode,
        )
        self.session.add(decision_row)
        self.session.flush()
        result.decision_id = decision_row.id
        # P3-12: the explanation is built before persistence so the non-persisting
        # path still gets one, which leaves the dispute payload to be completed here —
        # a "file a false positive" link with no decision id is not a route anywhere.
        if result.explanation.get("dispute"):
            result.explanation["dispute"]["payload"]["decision_id"] = decision_row.id
            result.explanation["decision_id"] = decision_row.id

        # --- 6. escalation (P2-3) ----------------------------------------
        if effective == "escalate":
            approval = request_approval(
                self.session,
                agent_id=agent.id if agent else None,
                tool_key=tool_key,
                arguments=arguments or {},
                reason=reason,
                trace_id=trace_id,
                decision_id=decision_row.id,
            )
            decision_row.approval_id = approval.id
            result.approval_id = approval.id

        if trace_id:
            add_span(
                self.session,
                trace_id,
                kind="guardrail",
                name=f"guard.{surface}",
                attributes={
                    ATTR_AGENT: agent_slug,
                    ATTR_VERDICT: verdict,
                    ATTR_TAINT: taint_summary.get("max_source"),
                    ATTR_TOOL_NAME: tool_key,
                    ATTR_TOOL_IMPACT: tool_impact,
                    "nometria.entities": result.entities,
                    "nometria.rules": [r.get("rule_id") for r in rules_fired],
                    "nometria.detectors": [r.detector_key for r in pipeline_result.results],
                },
                duration_ms=latency_ms,
            )

        if pipeline_result.degraded:
            self.session.add(
                Finding(
                    type="budget_breach",
                    severity="medium",
                    title=f"Detector(s) degraded on {surface}: {pipeline_result.degraded}",
                    subject_type="agent",
                    subject_id=agent.id if agent else None,
                    evidence_json=pipeline_result.summary(),
                    control_keys=["NOM-RTG-06"],
                )
            )

        chain.append(
            self.session,
            f"decision.{verdict}",
            actor_type="agent",
            actor_id=agent_slug,
            subject_type="decision",
            subject_id=decision_row.id,
            payload={
                "surface": surface,
                "tool": tool_key,
                "verdict": verdict,
                "effective_verdict": effective,
                "mode": mode,
                "policy_version_id": policy_version_id,
                "rules_fired": rules_fired,
                "entities": result.entities,
                "taint": taint_summary.get("max_source"),
                "latency_ms": round(latency_ms, 2),
                "trace_id": trace_id,
            },
        )
        return result

    # ------------------------------------------------------------------
    # Convenience surfaces
    # ------------------------------------------------------------------

    def check_content(
        self,
        agent_slug: str,
        content: str,
        surface: str = "input",
        taint_source: str = "user",
        persist: bool = True,
    ) -> dict[str, Any]:
        """Light single-surface check. Used by the red-team runner."""
        agent = self.session.scalar(select(Agent).where(Agent.slug == agent_slug))
        identity = (
            self.session.scalar(select(Identity).where(Identity.agent_id == agent.id))
            if agent
            else None
        )
        tracker = TaintTracker()
        tracker.mark("$.content", taint_source, content)
        result = self.evaluate(
            agent=agent,
            identity=identity,
            content=content,
            surface=surface,
            taint_source=taint_source,
            tracker=tracker,
            persist=persist,
        )
        return result.to_json()

    def guard_tool_call(
        self,
        *,
        agent_slug: str,
        tool_key: str,
        arguments: dict[str, Any],
        provenance: dict[str, str] | None = None,
        intent: str | None = None,
        trace: Trace | None = None,
        tracker: TaintTracker | None = None,
        credential: str | None = None,
        prior_tools: list[str] | None = None,
        verified_state: dict[str, Any] | None = None,
        dry_run: bool = False,
    ) -> EnforcementResult:
        """Authorise a tool call on the full execution path (P3-4, P2-2, P9)."""
        agent, identity, _ = self.resolve(agent_slug, credential)
        tracker = tracker or TaintTracker(trace_id=trace.id if trace else None)
        marks = tracker.taint_arguments(arguments, provenance)
        argument_taint = {path: mark.source for path, mark in marks.items()}

        if trace:
            for path, mark in marks.items():
                self.session.add(
                    TaintTag(
                        trace_id=trace.id,
                        path=path,
                        source=mark.source,
                        trust=mark.trust,
                        propagated_from=mark.propagated_from,
                    )
                )
        # Lineage is a property of the agent-to-tool relationship, not of whether a
        # trace object happened to be passed in — so it is recorded either way.
        if agent is not None:
            record_edge(self.session, "agent", agent.slug, "tool", tool_key, "calls_tool")

        worst_source = max(argument_taint.values(), key=taint_rank) if argument_taint else "none"
        result = self.evaluate(
            agent=agent,
            identity=identity,
            content=json.dumps(arguments, default=str),
            surface="tool_args",
            trace=trace,
            taint_source=worst_source,
            tool_key=tool_key,
            arguments=arguments,
            argument_taint=argument_taint,
            intent=intent,
            prior_tools=prior_tools,
            tracker=tracker,
        )

        # P9-7: an irreversible act on a record the agent has not read back from the
        # system of record is the HR-termination failure — the agent acted on a stale
        # or hallucinated view of the world. The check runs after the main evaluation
        # so it composes with, rather than replaces, everything else.
        stale = self._verified_state_gate(result, verified_state)
        if stale is not None and not dry_run:
            result.verdict = "block"
            result.effective_verdict = "block"
            result.rules_fired.append(stale)
            result.reason = stale["reason"]

        # P9-10: a dry run is analysis without execution. The verdict is computed and
        # recorded exactly as it would be, and the caller is told what *would* have
        # happened — which is what makes a policy safe to roll out.
        if dry_run:
            result.taint["dry_run"] = True
            result.verdict = "allow"
        return result

    def _verified_state_gate(
        self, result: EnforcementResult, verified_state: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        capability = (result.taint or {}).get("capability") or {}
        constraints = capability.get("constraints") or {}
        if not constraints.get("requires_verified_state"):
            return None

        max_age = self.settings.verified_state_max_age_seconds
        if not verified_state or not verified_state.get("read_at"):
            reason = (
                "this capability requires the record to be read back from the system "
                "of record before an irreversible act, and no state read was supplied"
            )
        else:
            try:
                read_at = dt.datetime.fromisoformat(str(verified_state["read_at"]))
                if read_at.tzinfo is None:
                    read_at = read_at.replace(tzinfo=dt.UTC)
                age = (dt.datetime.now(dt.UTC) - read_at).total_seconds()
            except ValueError:
                age = float("inf")
            if age <= max_age:
                return None
            reason = (
                f"the state read is {int(age)}s old and the capability requires it to "
                f"be no older than {max_age}s"
            )
        return {
            "rule_id": "action.unverified_state",
            "effect": "block",
            "reason": reason,
            "severity": "critical",
            "controls": ["NOM-RTG-09", "NOM-IAM-03"],
        }

    # ------------------------------------------------------------------
    # Full inline path (gateway)
    # ------------------------------------------------------------------

    def _severity(self, result: EnforcementResult) -> tuple[int, int]:
        return (_RANK[result.verdict], _RANK[result.effective_verdict])

    def _answerability_gate(
        self,
        agent: Agent | None,
        trace: Trace,
        messages: list[dict[str, Any]],
        known_entities: list[str] | None = None,
    ) -> EnforcementResult | None:
        """P7-2/3 — refuse to generate when the question is outside the declared boundary.

        Returns None when there is no boundary, when the question is answerable, or
        when the boundary is in observe mode. The observe case still records the
        counterfactual, so a team can see what enforcement *would* have refused before
        turning it on — which is the only responsible way to ship a control whose
        false positives are refusals.
        """
        boundary = get_boundary(self.session, agent.id if agent else None)
        if boundary is None:
            return None
        question = next(
            (
                _flatten(m.get("content"))
                for m in reversed(messages)
                if str(m.get("role")) == "user"
            ),
            "",
        )
        if not question.strip():
            return None

        verdict = classify_answerability(question, boundary, known_entities=known_entities)
        if verdict.answerable:
            return None

        rule = {
            "rule_id": f"answerability.{verdict.abstention_kind}",
            "effect": "abstain",
            "reason": verdict.reasons[0].get("reason")
            or f"question is {verdict.question_type}, outside the declared boundary",
            "severity": "medium",
            "controls": ["NOM-RTG-11"],
        }
        chain.append(
            self.session,
            action=f"answerability.{verdict.abstention_kind}",
            actor_type="agent",
            actor_id=agent.id if agent else None,
            subject_type="trace",
            subject_id=trace.id,
            payload={"question_type": verdict.question_type, "reasons": verdict.reasons},
        )
        result = EnforcementResult(
            # `abstain` sits between redact and escalate in the lattice: it withholds
            # the answer without treating the user as an adversary.
            verdict="abstain" if verdict.should_abstain else "allow",
            effective_verdict="abstain",
            mode=boundary.mode,
            trace_id=trace.id,
            rules_fired=[rule],
            reason=rule["reason"],
            content=verdict.response,
        )
        result.taint["answerability"] = verdict.to_json()
        return result if verdict.should_abstain else None

    def _answerability_postflight(self, agent: Agent | None, trace: Trace, answer: str) -> None:
        boundary = get_boundary(self.session, agent.id if agent else None)
        if boundary is None or not answer:
            return
        verdict = classify_answerability(answer, boundary)
        for breach in verify_boundary(answer, verdict, boundary):
            self.session.add(
                Finding(
                    type="boundary_breach",
                    severity="medium",
                    title=f"Answer exceeded the declared knowledge boundary: {breach['breach']}",
                    subject_type="agent",
                    subject_id=agent.id if agent else None,
                    evidence_json={**breach, "trace_id": trace.id},
                    control_keys=["NOM-RTG-11"],
                )
            )
        detect_over_refusal(
            self.session,
            answer=answer,
            verdict=verdict,
            agent_id=agent.id if agent else None,
            trace_id=trace.id,
        )

    def _evidence_checks(
        self, agent: Agent | None, surface: str, content: str, intent: str | None
    ) -> dict[str, Any]:
        """F2 source authority and F7 numeric integrity, on the output surface.

        Both need the evidence the answer was built from, which the caller supplies
        via ``self.evidence``. When nothing is supplied they return quietly rather
        than guessing: an integrity check that invents its own ground truth is worse
        than none.
        """
        if surface != "output" or not content:
            return {}
        evidence = self.evidence or {}
        chunks = evidence.get("chunks")
        records = evidence.get("records")
        entities = evidence.get("entities")
        if not any((chunks, records, entities, evidence.get("components"))):
            return {}

        context_text = " ".join(str(c.get("text") or "") for c in (chunks or []))
        provenance = assess_provenance(
            self.session, content, chunks, agent_domain=evidence.get("domain")
        )
        integrity = assess_integrity(
            question=intent or evidence.get("question", ""),
            answer=content,
            context=context_text,
            records=records,
            entities=entities,
            components=evidence.get("components"),
        )

        issues: list[dict[str, Any]] = []
        for breach in provenance.breaches:
            issues.append(
                {
                    "type": "source_authority",
                    "severity": "high" if breach["kind"] == "deprecated_source" else "medium",
                    "title": breach["reason"],
                    **breach,
                }
            )
        for fabricated in provenance.fabricated:
            issues.append(
                {
                    "type": "fabricated_citation",
                    "severity": "high",
                    "title": fabricated["reason"],
                    **fabricated,
                }
            )
        for conflict in provenance.conflicts:
            issues.append(
                {
                    "type": "source_conflict",
                    "severity": "medium",
                    "title": conflict["reason"],
                    **conflict,
                }
            )
        for issue in integrity.issues:
            issues.append(
                {
                    "type": "integrity_error",
                    "severity": "high"
                    if issue["kind"] in ("hallucinated_record", "entity_confusion")
                    else "medium",
                    "title": issue["reason"],
                    **issue,
                }
            )
        return {
            "provenance": provenance.to_json(),
            "integrity": integrity.to_json(),
            "evidence_issues": issues,
        }

    # -- I-4/I-6 observability correlation -------------------------------

    def _correlate(self, trace, correlation) -> None:
        """Record the join key to LangSmith/Langfuse. Never fails the request.

        Correlation is a convenience for the humans debugging later; it must not be
        able to take down the path it is describing.
        """
        try:
            if isinstance(correlation, dict):
                refs = refs_from_headers(correlation)
            elif correlation:
                refs = list(correlation)
            else:
                refs = []
            refs = refs + refs_from_env()
            if refs:
                link_trace(self.session, trace.id, refs)
        except Exception as exc:  # pragma: no cover - defensive
            log.debug("correlation link skipped: %s", exc)

    def _push_correlation(self, trace, result, agent_slug: str | None) -> None:
        try:
            push_verdict(
                self.session,
                trace.id,
                verdict=result.verdict,
                effective_verdict=result.effective_verdict,
                rules=[r.get("rule_id", "") for r in result.rules_fired],
                agent_slug=agent_slug,
            )
        except Exception as exc:  # pragma: no cover - defensive
            log.debug("correlation push skipped: %s", exc)

    def preflight(
        self,
        *,
        agent_slug: str | None,
        messages: list[dict[str, Any]],
        model: str = "default",
        provider: str | None = None,
        credential: str | None = None,
        environment: str = "production",
        session_id: str | None = None,
        intent: str | None = None,
        trust_map: dict[str, str] | None = None,
        correlation: dict[str, str] | list[Any] | None = None,
        known_entities: list[str] | None = None,
    ) -> PreflightOutcome:
        """Steps 2-6 of the request path, shared by buffered and streaming calls.

        Extracted so that streaming cannot drift from non-streaming enforcement. A
        streaming path that quietly skips a check is exactly the class of defect
        PL-1 exists to remove.
        """
        self.reset_ledger()
        agent, identity, _is_shadow = self.resolve(
            agent_slug, credential, environment=environment, model=model
        )

        # PL-3: a killed or quarantined agent never reaches the model.
        control = self._control_verdict(agent)
        if control is not None:
            trace = start_trace(
                self.session,
                agent_id=agent.id if agent else None,
                agent_slug=agent.slug if agent else agent_slug,
                session_id=session_id,
                environment=environment,
                intent=intent,
                model=model,
                provider=provider or self.settings.default_provider,
            )
            self._correlate(trace, correlation)
            control.trace_id = trace.id
            end_trace(self.session, trace, verdict=control.verdict, status="blocked")
            self._push_correlation(trace, control, agent.slug if agent else agent_slug)
            return PreflightOutcome(
                agent=agent, identity=identity, trace=trace, result=control, stopped=True
            )

        trace = start_trace(
            self.session,
            agent_id=agent.id if agent else None,
            agent_slug=agent.slug if agent else agent_slug,
            session_id=session_id,
            environment=environment,
            intent=intent,
            model=model,
            provider=provider or self.settings.default_provider,
        )

        self._correlate(trace, correlation)

        # P15-3: hard caps, checked before the model call rather than after the spend.
        budget = self._budget_gate(agent, trace)
        if budget is not None:
            end_trace(self.session, trace, verdict="block", status="blocked")
            self._push_correlation(trace, budget, agent.slug if agent else agent_slug)
            return PreflightOutcome(
                agent=agent, identity=identity, trace=trace, result=budget, stopped=True
            )

        # P7: answerability, before generation. Every competitor scores the answer
        # after it exists, which cannot address F1 — by then the number has been
        # invented, and a confident wrong number scored at 0.4 is still a confident
        # wrong number in front of a user.
        abstain = self._answerability_gate(agent, trace, messages, known_entities)
        if abstain is not None:
            end_trace(self.session, trace, verdict=abstain.verdict, status="abstained")
            self._push_correlation(trace, abstain, agent.slug if agent else agent_slug)
            return PreflightOutcome(
                agent=agent, identity=identity, trace=trace, result=abstain, stopped=True
            )

        tracker = TaintTracker(trace_id=trace.id)
        tracker.mark_messages(messages, trust_map)
        for mark in tracker.marks:
            self.session.add(
                TaintTag(
                    trace_id=trace.id,
                    path=mark.path,
                    source=mark.source,
                    trust=mark.trust,
                    propagated_from=mark.propagated_from,
                )
            )

        worst = EnforcementResult()
        redacted_messages = list(messages)

        for i, message in enumerate(messages):
            text = _flatten(message.get("content"))
            if not text.strip():
                continue
            role = str(message.get("role", "user"))
            source = (trust_map or {}).get(str(i)) or {
                "system": "none",
                "developer": "none",
                "assistant": "none",
                "user": "user",
                "tool": "tool_result",
                "function": "tool_result",
            }.get(role, "user")
            surface = {
                "tool_result": "tool_result",
                "retrieved": "retrieved",
                "subagent": "tool_result",
            }.get(source, "input")

            outcome = self.evaluate(
                agent=agent,
                identity=identity,
                content=text,
                surface=surface,
                trace=trace,
                taint_source=source,
                intent=intent,
                tracker=tracker,
            )
            if outcome.content is not None:
                redacted_messages[i] = {**message, "content": outcome.content}
            if self._severity(outcome) >= self._severity(worst):
                worst = outcome

        worst.trace_id = trace.id
        if worst.blocked or worst.escalated:
            end_trace(self.session, trace, verdict=worst.verdict, status="blocked")
            return PreflightOutcome(
                agent=agent,
                identity=identity,
                trace=trace,
                tracker=tracker,
                messages=redacted_messages,
                result=worst,
                stopped=True,
            )

        return PreflightOutcome(
            agent=agent,
            identity=identity,
            trace=trace,
            tracker=tracker,
            messages=redacted_messages,
            result=worst,
        )

    def _budget_gate(self, agent: Agent | None, trace: Trace) -> EnforcementResult | None:
        """P15-3. A breach is a governed event with an audit entry and a finding —
        not an HTTP 429 that disappears into a load balancer log."""
        if agent is None:
            return None
        verdict: BudgetVerdict = check_budget(self.session, "agent", agent.id)
        if not verdict.exceeded:
            return None

        raise_budget_finding(self.session, "agent", agent.id, verdict)
        result = EnforcementResult(
            verdict="block",
            effective_verdict="block",
            mode="enforce",
            trace_id=trace.id,
            reason=verdict.reason,
            rules_fired=[
                {
                    "rule_id": "budget.exhausted",
                    "effect": "block",
                    "reason": verdict.reason,
                    "severity": "high",
                    "controls": ["NOM-RTG-08"],
                }
            ],
        )
        chain.append(
            self.session,
            "budget.exhausted",
            actor_type="agent",
            actor_id=agent.slug,
            subject_type="agent",
            subject_id=agent.id,
            payload=verdict.to_json(),
        )
        return result

    def call_provider(
        self,
        request: CompletionRequest,
        *,
        provider: str | None,
        model: str,
        ladder: FallbackLadder | None = None,
        stream: bool = False,
    ):
        """Call a provider with circuit breaking and a degradation ladder (P15-1/2).

        Returns ``(response_or_iterator, DegradationRecord)``. Degradation is recorded
        rather than silently absorbed: an answer served by a smaller model did not come
        from the model the agent was evaluated against, and a baseline that quietly
        covers a different model is worthless.
        """
        preferred = _Rung(provider or self.settings.default_provider, model)
        ladder = ladder or FallbackLadder.parse(self.settings.fallback_chain)
        record = DegradationRecord()
        last_error: Exception | None = None

        for index, rung in enumerate([preferred, *ladder.rungs]):
            key = f"{rung.provider}:{rung.model}"
            if not BREAKER.allows(key):
                record.attempts.append(
                    ProviderAttempt(
                        rung.provider,
                        rung.model,
                        ok=False,
                        error="circuit open — failing fast",
                        breaker_state=BREAKER.state_of(key),
                    )
                )
                continue
            try:
                model_provider = get_provider(rung.provider)
            except KeyError as exc:
                record.attempts.append(
                    ProviderAttempt(rung.provider, rung.model, ok=False, error=str(exc))
                )
                continue

            attempt_request = CompletionRequest(
                messages=request.messages,
                model=rung.model or request.model,
                temperature=request.temperature,
                max_tokens=request.max_tokens,
                tools=request.tools,
            )
            try:
                result = (
                    model_provider.stream(attempt_request)
                    if stream
                    else model_provider.complete(attempt_request)
                )
            except Exception as exc:  # noqa: BLE001 - any provider failure trips the breaker
                BREAKER.record_failure(key)
                last_error = exc
                record.attempts.append(
                    ProviderAttempt(
                        rung.provider,
                        rung.model,
                        ok=False,
                        error=str(exc),
                        breaker_state=BREAKER.state_of(key),
                    )
                )
                continue

            BREAKER.record_success(key)
            record.attempts.append(ProviderAttempt(rung.provider, rung.model, ok=True))
            record.served_by = key
            record.degraded = index > 0
            return result, model_provider, record

        raise ProviderUnavailable(
            f"every provider on the ladder failed or is circuit-open: "
            f"{[a.provider + ':' + a.model for a in record.attempts]}"
        ) from last_error

    def _control_verdict(self, agent: Agent | None) -> EnforcementResult | None:
        """PL-3 kill switch / quarantine. Checked before anything else."""
        if agent is None:
            return None
        from .models import AgentControl

        control = self.session.scalar(select(AgentControl).where(AgentControl.agent_id == agent.id))
        if control is None or control.state == "active":
            return None

        reason = (
            f"Agent is {control.state}"
            + (f": {control.reason}" if control.reason else "")
            + (f" (by {control.actor})" if control.actor else "")
        )
        return EnforcementResult(
            verdict="block",
            effective_verdict="block",
            mode="enforce",
            reason=reason,
            rules_fired=[
                {
                    "rule_id": f"agent.{control.state}",
                    "effect": "block",
                    "reason": reason,
                    "severity": "critical",
                    "controls": ["NOM-DSC-02"],
                }
            ],
        )

    def _finish_completion(
        self,
        *,
        agent,
        agent_slug,
        identity,
        trace,
        tracker,
        worst,
        response,
        model,
        model_provider,
        provider_ms,
        intent,
        schema,
        severity=None,
    ) -> tuple[EnforcementResult, Any]:
        """Post-flight, span, budget and trace close — shared by both paths."""
        rank = severity or self._severity
        add_span(
            self.session,
            trace,
            kind="llm",
            name=f"{model_provider.key}.complete",
            attributes={
                ATTR_SYSTEM: model_provider.key,
                ATTR_REQUEST_MODEL: model,
                ATTR_AGENT: agent.slug if agent else agent_slug,
                "gen_ai.usage.input_tokens": response.usage.get("input_tokens", 0),
                "gen_ai.usage.output_tokens": response.usage.get("output_tokens", 0),
                "nometria.output": response.text,
            },
            duration_ms=provider_ms,
        )

        outbound = self.evaluate(
            agent=agent,
            identity=identity,
            content=response.text,
            surface="output",
            trace=trace,
            taint_source="none",
            intent=intent,
            schema=schema,
            tracker=tracker,
        )
        if outbound.content is not None:
            response.text = outbound.content
        final = outbound if rank(outbound) >= rank(worst) else worst
        final.trace_id = trace.id

        # P7-4/P7-6: post-flight boundary verification and the counter-metric. Both
        # produce findings and neither blocks — an over-refusing agent is uninstalled
        # faster than a hallucinating one, so this side of the control never enforces.
        self._answerability_postflight(agent, trace, response.text)

        self._charge_budget(agent, response)
        end_trace(
            self.session,
            trace,
            verdict=final.verdict,
            status="ok",
            usage=response.usage,
            cost_usd=response.cost_usd,
        )
        self._push_correlation(trace, final, agent.slug if agent else agent_slug)
        return final, (None if final.blocked else response)

    def run_completion(
        self,
        *,
        agent_slug: str | None,
        messages: list[dict[str, Any]],
        model: str = "default",
        provider: str | None = None,
        credential: str | None = None,
        environment: str = "production",
        session_id: str | None = None,
        intent: str | None = None,
        trust_map: dict[str, str] | None = None,
        correlation: dict[str, str] | list[Any] | None = None,
        known_entities: list[str] | None = None,
        evidence: dict[str, Any] | None = None,
        schema: dict[str, Any] | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
    ) -> tuple[EnforcementResult, Any]:
        """The complete request path (PRD §9.3). Returns (result, response|None)."""
        pre = self.preflight(
            agent_slug=agent_slug,
            messages=messages,
            model=model,
            provider=provider,
            credential=credential,
            environment=environment,
            session_id=session_id,
            intent=intent,
            trust_map=trust_map,
            correlation=correlation,
            known_entities=known_entities,
        )
        if evidence is not None:
            self.evidence = evidence
        if pre.stopped:
            return pre.result, None

        agent, identity, trace = pre.agent, pre.identity, pre.trace
        tracker, redacted_messages, worst = pre.tracker, pre.messages, pre.result

        def severity(result: EnforcementResult) -> tuple[int, int]:
            return (_RANK[result.verdict], _RANK[result.effective_verdict])

        # --- 7. provider call --------------------------------------------
        started = time.perf_counter()
        response, model_provider, degradation = self.call_provider(
            CompletionRequest(
                messages=redacted_messages,
                model=model,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
            provider=provider,
            model=model,
        )
        provider_ms = (time.perf_counter() - started) * 1000
        worst.taint = {**worst.taint, "degradation": degradation.to_json()}
        return self._finish_completion(
            agent=agent,
            agent_slug=agent_slug,
            identity=identity,
            trace=trace,
            tracker=tracker,
            worst=worst,
            response=response,
            model=model,
            model_provider=model_provider,
            provider_ms=provider_ms,
            intent=intent,
            schema=schema,
            severity=severity,
        )

    # ------------------------------------------------------------------
    # Streaming path (PL-1)
    # ------------------------------------------------------------------

    def run_completion_stream(
        self,
        *,
        agent_slug: str | None,
        messages: list[dict[str, Any]],
        model: str = "default",
        provider: str | None = None,
        credential: str | None = None,
        environment: str = "production",
        session_id: str | None = None,
        intent: str | None = None,
        trust_map: dict[str, str] | None = None,
        correlation: dict[str, str] | list[Any] | None = None,
        known_entities: list[str] | None = None,
        evidence: dict[str, Any] | None = None,
        schema: dict[str, Any] | None = None,
        temperature: float = 0.0,
        max_tokens: int | None = None,
        mode: str | None = None,
    ) -> Iterator[StreamEvent]:
        """Enforced streaming completion (PL-1).

        Two modes, and the trade-off between them is real rather than cosmetic:

        ``buffered`` (default)
            Accumulate the whole response, run the full post-flight, then release.
            Output enforcement is *identical* to the non-streaming path — nothing can
            leak — at the cost of first-token latency. This is the correct default
            because a DLP control that only inspects the first 200 characters is not
            a DLP control.

        ``windowed``
            Forward chunks as they arrive while running detectors over a growing
            window. First-token latency is preserved, and the honest caveat is that
            **content already forwarded cannot be recalled** — a block terminates the
            stream but does not un-send what preceded it. Offered for latency-critical
            deployments that accept that trade knowingly, never as a silent default.
        """
        mode = mode or self.settings.streaming_mode
        pre = self.preflight(
            agent_slug=agent_slug,
            messages=messages,
            model=model,
            provider=provider,
            credential=credential,
            environment=environment,
            session_id=session_id,
            intent=intent,
            trust_map=trust_map,
            correlation=correlation,
            known_entities=known_entities,
        )
        if evidence is not None:
            self.evidence = evidence
        if pre.stopped:
            yield StreamEvent(kind="blocked", result=pre.result)
            return

        agent, identity, trace = pre.agent, pre.identity, pre.trace
        tracker, redacted_messages, worst = pre.tracker, pre.messages, pre.result

        request = CompletionRequest(
            messages=redacted_messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        started = time.perf_counter()
        stream_iter, model_provider, degradation = self.call_provider(
            request, provider=provider, model=model, stream=True
        )
        accumulated: list[str] = []
        usage: dict[str, int] = {}
        finish_reason: str | None = None
        pending: list[StreamEvent] = []
        last_checked = 0
        window = self.settings.stream_window_chars

        for chunk in stream_iter:
            if chunk.usage:
                usage = chunk.usage
            if chunk.finish_reason:
                finish_reason = chunk.finish_reason
            if not chunk.delta:
                continue
            accumulated.append(chunk.delta)
            event = StreamEvent(kind="delta", delta=chunk.delta)

            if mode == "windowed":
                yield event
                text = "".join(accumulated)
                # Re-check only when enough new content has arrived to be worth the
                # detector pass; every chunk would blow the latency budget.
                if len(text) - last_checked >= window:
                    last_checked = len(text)
                    interim = self.evaluate(
                        agent=agent,
                        identity=identity,
                        content=text,
                        surface="output",
                        trace=trace,
                        taint_source="none",
                        intent=intent,
                        tracker=tracker,
                        persist=False,
                    )
                    if interim.blocked:
                        interim.trace_id = trace.id
                        end_trace(self.session, trace, verdict="block", status="blocked")
                        yield StreamEvent(kind="blocked", result=interim)
                        return
            else:
                pending.append(event)

        provider_ms = (time.perf_counter() - started) * 1000
        from .providers import CompletionResponse

        response = CompletionResponse(
            text="".join(accumulated),
            model=model,
            provider=model_provider.key,
            usage=usage,
        )

        final, released = self._finish_completion(
            agent=agent,
            agent_slug=agent_slug,
            identity=identity,
            trace=trace,
            tracker=tracker,
            worst=worst,
            response=response,
            model=model,
            model_provider=model_provider,
            provider_ms=provider_ms,
            intent=intent,
            schema=schema,
        )

        if mode == "buffered":
            if final.blocked:
                yield StreamEvent(kind="blocked", result=final)
                return
            # Release the (possibly redacted) text. Redaction is why this is not a
            # simple replay of `pending`: post-flight may have rewritten the content.
            text = released.text if released else ""
            if text == "".join(accumulated):
                yield from pending
            else:
                yield StreamEvent(kind="delta", delta=text)
        elif final.blocked:
            # Windowed mode: the tail was blocked after content had already been sent.
            yield StreamEvent(kind="blocked", result=final)
            return

        yield StreamEvent(
            kind="done", finish_reason=finish_reason or "stop", usage=usage, result=final
        )

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------

    def _persist_detectors(self, pipeline_result, trace_id: str | None, surface: str) -> list[str]:
        ids: list[str] = []
        for run in pipeline_result.results:
            row = DetectorRun(
                trace_id=trace_id,
                detector_key=run.detector_key,
                detector_version=run.version,
                surface=surface,
                duration_ms=run.duration_ms,
                status=run.status,
                score=run.score,
                raw_json=run.raw,
            )
            self.session.add(row)
            self.session.flush()
            ids.append(row.id)
            for detection in run.detections:
                self.session.add(
                    DetectionFinding(
                        detector_run_id=row.id,
                        trace_id=trace_id,
                        entity_type=detection.entity_type,
                        score=detection.score,
                        start=detection.start,
                        end=detection.end,
                        # Already redacted by the detector — see redact_sample().
                        sample=detection.sample[:200],
                        owasp_id=detection.owasp_id,
                        atlas_id=detection.atlas_id,
                    )
                )
        return ids

    def _budget_state(
        self,
        agent: Agent | None,
        trace: Trace | None,
        tool_key: str | None,
        prior_tools: list[str],
    ) -> dict[str, Any]:
        state: dict[str, Any] = {"exceeded": False, "loop_detected": False}
        if tool_key and prior_tools:
            # A tool called repeatedly in one execution path is the runaway-loop
            # shape (OWASP LLM10 / Agentic T4).
            repeats = prior_tools.count(tool_key)
            state["repeat_count"] = repeats
            state["loop_detected"] = repeats >= 3
            state["depth"] = len(prior_tools)

        if agent is None:
            return state
        budget = self.session.scalar(
            select(Budget).where(Budget.scope_type == "agent", Budget.scope_id == agent.id)
        )
        if budget is None:
            return state
        exceeded = []
        if budget.max_calls is not None and budget.calls >= budget.max_calls:
            exceeded.append("calls")
        if budget.max_tokens is not None and budget.tokens >= budget.max_tokens:
            exceeded.append("tokens")
        if budget.max_cost_usd is not None and budget.cost_usd >= budget.max_cost_usd:
            exceeded.append("cost")
        if budget.max_depth is not None and len(prior_tools) >= budget.max_depth:
            exceeded.append("depth")
        state.update(
            {
                "exceeded": bool(exceeded),
                "exceeded_dimensions": exceeded,
                "calls": budget.calls,
                "tokens": budget.tokens,
                "cost_usd": round(budget.cost_usd, 6),
            }
        )
        return state

    def _charge_budget(self, agent: Agent | None, response) -> None:
        if agent is None:
            return
        budget = self.session.scalar(
            select(Budget).where(Budget.scope_type == "agent", Budget.scope_id == agent.id)
        )
        if budget is None:
            return
        budget.calls += 1
        budget.tokens += sum(response.usage.values())
        budget.cost_usd += response.cost_usd
        self.session.flush()
