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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .agent_messaging import verify_message
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
from .business.graph import BUSINESS_RANK
from .business.graph import combine as combine_business
from .business.ladder import LadderDecision
from .business.ladder import evaluate as evaluate_ladder
from .business.store import load_ladders
from .config import get_settings
from .crypto import DecryptionFailed, decrypt_secret
from .entitlement import (
    aggregation_risk,
    filter_retrieval,
    inference_risk,
    record_disclosure,
)
from .guardrails import (
    DetectionContext,
    DetectorPipeline,
    TaintTracker,
    redact_content,
)
from .guardrails.actions import analyse_arguments
from .guardrails.actions import summarise as summarise_actions
from .guardrails.base import taint_rank
from .guardrails.composition import check_composed_escalation
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
    AgentMessageLog,
    AgentSigningKey,
    Budget,
    Decision,
    DetectionFinding,
    DetectorRun,
    Finding,
    Identity,
    MemoryEntry,
    TaintTag,
    Tool,
    Trace,
    as_aware,
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
                # Debounced for the same reason as observe_agent()'s own
                # last_seen_at write (registry/service.py) — an unconditional
                # write here is the same redundant-second-writer hazard when this
                # session and another already-open session both resolve the same
                # agent within one logical call.
                now = utcnow()
                last_seen = as_aware(agent.last_seen_at)
                if last_seen is None or (now - last_seen) > dt.timedelta(seconds=5):
                    agent.last_seen_at = now
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
        argument_propagated_from: dict[str, str] | None = None,
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
        disclosure = self._disclosure_checks(agent, surface, content, trace_id)
        if disclosure:
            merged_issues = [
                *evidence.get("evidence_issues", []),
                *disclosure.pop("evidence_issues", []),
            ]
            evidence.update(disclosure)
            if merged_issues:
                evidence["evidence_issues"] = merged_issues

        # --- Business ladders ---------------------------------------------
        # Evaluated separately from policy and combined afterwards, because the two
        # compose by different algebras: rules take the lattice maximum, ladders select
        # exactly one band. Security dominates the combination, so a band that says
        # auto-approve can never loosen a rule that says block.
        ladder_decision = self._business_ladders(agent, surface, tool_key, arguments)

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
            "business": ladder_decision.to_json() if ladder_decision else {},
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

        # P9-11/F3.8: a read tool's output flowing into a higher-impact tool's
        # argument is a composed escalation neither tool's own scope permits
        # alone — a fact about this call's inputs, not a policy opinion, so it
        # stands on its own exactly like the critical-action-risk check above.
        composition_findings = (
            check_composed_escalation(
                consuming_tool_key=tool_key,
                consuming_tool_impact=tool_impact,
                argument_propagated_from=argument_propagated_from or {},
                tool_impact_lookup=lambda key: self.session.scalar(
                    select(Tool.impact).where(Tool.key == key)
                ),
            )
            if tool_key
            else []
        )
        taint_summary["composition"] = [f.to_json() for f in composition_findings]
        for finding in composition_findings:
            rule_id = f"composition.escalation.{finding.argument_path}"
            if rule_id in fired_ids:
                continue
            verdict = "block"
            effective = "block"
            fired_ids.add(rule_id)
            rules_fired.append(
                {
                    "rule_id": "composition.escalation",
                    "effect": "block",
                    "reason": finding.reason,
                    "severity": "critical",
                    "controls": ["NOM-RTG-09"],
                    "evidence": finding.to_json(),
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

        # The ladder outcome joins here rather than in the rule list, so that its
        # `verify` and `allow` outcomes cannot be swept into the lattice maximum and
        # silently promoted or ignored.
        if ladder_decision is not None and ladder_decision.outcome != "allow":
            combined = combine_business(effective, ladder_decision)
            if combined.verdict != effective:
                effective = combined.verdict
                if mode == "enforce":
                    verdict = combined.verdict
            rules_fired.append(
                {
                    "rule_id": f"business.{ladder_decision.ladder_key}",
                    "effect": ladder_decision.outcome,
                    "reason": ladder_decision.reason,
                    "severity": "medium",
                    "controls": ["NOM-GOV-07"],
                    "evidence": ladder_decision.to_json(),
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

        # A detector catch is invisible outside the trace it happened on unless it
        # actually changed the outcome — surfacing every allowed pass here would
        # flood the queue with routine catches nobody needs to act on. When it
        # *did* change the outcome, an operator reviewing findings gets nothing to
        # go on today but the entity type: `Detection.sample` is already redacted
        # at construction (P5-5), so there is no reason to withhold it a second
        # time behind a blanket "we don't store this" — showing the masked excerpt
        # is strictly more useful than a bare category name, and no less safe.
        if effective != "allow" and pipeline_result.detections:
            self._raise_detection_finding(
                agent=agent,
                trace_id=trace_id,
                decision_id=decision_row.id,
                surface=surface,
                effective=effective,
                reason=reason,
                rules_fired=rules_fired,
                detections=pipeline_result.detections,
            )

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

        # PL-3: a killed or quarantined agent must not execute tools either, not
        # just be denied new completions. `preflight` already checks this before an
        # agent reaches the model — but an integration that calls `guard_tool_call`
        # directly (McpGovernor, NometriaGuard.tool_node, any multi-step agentic
        # loop that already has a tool call decided) bypasses `preflight` entirely,
        # and this check was missing here. Found by benchmarking Tier D excessive-
        # agency scenarios: a quarantined agent's otherwise-valid, in-budget tool
        # call went straight through. Checked before anything else, same as
        # `preflight`, because "we killed this agent" is an operational fact, not a
        # policy outcome that a dry run should soften.
        control = self._control_verdict(agent)
        if control is not None:
            return control

        tracker = tracker or TaintTracker(trace_id=trace.id if trace else None)
        marks = tracker.taint_arguments(arguments, provenance)
        argument_taint = {path: mark.source for path, mark in marks.items()}
        # F3.8: which arguments were inferred (not caller-declared) from an
        # earlier tool's result, and which tool that was — see composition.py.
        argument_propagated_from = {
            path: mark.propagated_from for path, mark in marks.items() if mark.propagated_from
        }

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
            argument_propagated_from=argument_propagated_from,
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

    def check_conversation_window(
        self,
        *,
        agent_slug: str,
        session_id: str,
        new_user_text: str,
        window: int = 6,
        trace: Trace | None = None,
    ) -> EnforcementResult:
        """Tier A — payload-splitting / multi-turn jailbreak defense.

        Every other detection path in this file evaluates one message (`evaluate`)
        or one tool call (`guard_tool_call`) in isolation. That is a real, named gap:
        an attacker can split a payload across several turns — each individually
        innocuous — that only reads as an attack once assembled ("payload
        splitting", OWASP LLM01; see also Microsoft's "Crescendo" multi-turn
        jailbreak, arXiv:2404.01833, which escalates gradually rather than splitting
        a single payload but defeats per-message evaluation the same way). Found by
        actually checking: neither `autoguard.py`'s `_govern` (joins one call's own
        `messages` array, but never a previous *separate* call) nor the gateway's
        `preflight` (loops per-message, never joins) re-evaluates content against
        conversation history.

        This closes it using the substrate that already exists for a different
        reason — `ConversationTurn`, written by escalation governance (P11) — by
        joining the last `window` turns' `user_text` with the new message and
        running the same detector pipeline over the assembled text. Requires the
        caller to supply a stable `session_id` across turns (the same requirement
        `record_turn` already has); without one, this degrades to evaluating the
        new message alone, harmlessly.
        """
        from .models import ConversationTurn

        agent, identity, _ = self.resolve(agent_slug)
        prior = list(
            reversed(
                self.session.scalars(
                    select(ConversationTurn)
                    .where(ConversationTurn.session_id == session_id)
                    .order_by(ConversationTurn.turn_index.desc())
                    .limit(window)
                ).all()
            )
        )
        joined = "\n".join([t.user_text for t in prior if t.user_text] + [new_user_text])
        return self.evaluate(
            agent=agent,
            identity=identity,
            content=joined,
            surface="input",
            trace=trace,
        )

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
    # Memory write governance (P14, NOM-RTG-13) — closes OWASP ASI06
    # ------------------------------------------------------------------

    def guard_memory_write(
        self,
        *,
        agent_slug: str,
        content: str,
        subject: str | None = None,
        taint_source: str = "user",
        provenance: dict[str, Any] | None = None,
        verified_by: str | None = None,
        ttl_seconds: int | None = None,
        trace: Trace | None = None,
        credential: str | None = None,
        persist: bool = True,
    ) -> EnforcementResult:
        """Authorise a write into an agent's long-term memory before it commits.

        A write into a vector store, a `mem0`-style store, or a LangGraph
        checkpointer is governed the same way a tool call is — the detector
        pipeline runs on the way *in*, not only at retrieval time, so a poisoned
        entry that would be blocked on the way out never gets the chance to
        persist on the way in.

        Provenance is carried on the entry itself so a later retrieval can weight
        or refuse it the way P8 already weights a source tier. An entry nobody
        has verified (``verified_by=None``) defaults **closed**: it decays after
        ``ttl_seconds`` (default: ``settings.memory_unverified_ttl_seconds``)
        rather than persisting indefinitely — the opposite default from
        :class:`Suppression`, deliberately, because an unconfirmed memory has not
        earned the benefit of the doubt a human-authored suppression has.
        """
        agent, identity, _ = self.resolve(agent_slug, credential)
        result = self.evaluate(
            agent=agent,
            identity=identity,
            content=content,
            surface="memory_write",
            trace=trace,
            taint_source=taint_source,
            persist=persist,
        )
        # Mode-aware, like every other surface (R3: nothing blocks until a
        # policy is promoted to enforce) — `result.verdict`, not the
        # `effective_verdict` counterfactual, is what actually gates the
        # write. Once enforced, a blocked or escalated write does not get to
        # persist at all: that is the entire point of governing the write
        # path rather than only the read path. tokenize/mask/redact still
        # persist, but the *redacted* content (`result.content` is only set
        # when the verdict rewrote it), matching every other surface.
        if persist and result.verdict not in ("block", "escalate", "abstain"):
            expires_at = None
            if verified_by is None:
                ttl = ttl_seconds if ttl_seconds is not None else self.settings.memory_unverified_ttl_seconds
                expires_at = utcnow() + dt.timedelta(seconds=ttl)
            entry = MemoryEntry(
                agent_id=agent.id if agent else None,
                subject=subject,
                content=result.content if result.content is not None else content,
                taint_source=taint_source,
                provenance=provenance or {},
                decision_id=result.decision_id,
                verified_by=verified_by,
                expires_at=expires_at,
            )
            self.session.add(entry)
            self.session.flush()
            result.taint["memory_entry_id"] = entry.id
            result.taint["memory_expires_at"] = expires_at.isoformat() if expires_at else None
        return result

    # ------------------------------------------------------------------
    # Inter-agent message security (P17, NOM-IAM-08) — closes OWASP ASI07
    # ------------------------------------------------------------------

    def guard_agent_message(
        self,
        *,
        sender_slug: str,
        content: str,
        recipient_slug: str | None = None,
        nonce: str | None = None,
        timestamp: float | None = None,
        signature: str | None = None,
        trace: Trace | None = None,
        persist: bool = True,
    ) -> EnforcementResult:
        """Authorise a sub-agent's message to another agent, as another agent's
        untrusted claim rather than as a tool's return value.

        Three checks layer on top of the generic detector pipeline, each mapped
        to the corresponding half of OWASP ASI07:

        * **Agent-card check** — the declared sender must resolve to a
          registered agent, reusing :func:`registry.service.attest_registry`'s
          declared-vs-observed comparison rather than a second attestation
          mechanism. An unregistered sender cannot be vouched for.
        * **Replay protection** — ``(sender, nonce)`` must be unique. A repeat
          fails to insert into ``agent_message_log`` and the message is blocked
          as a replay, full stop, before the detector pipeline even runs.
        * **Signature verification** — where the sender has a registered signing
          key (:mod:`agent_messaging`), the HMAC is checked. Where the transport
          is external (a customer's own A2A/MCP bus) and no signature is
          present, the message is reported **unsigned** rather than silently
          trusted — same "declare the gap, don't hide it" convention P14 uses
          for what it doesn't check.
        """
        agent, identity, _ = self.resolve(sender_slug, None)
        agent_card_match = agent is not None and bool(agent.registered)
        nonce = nonce or ""

        replayed = False
        if persist:
            # A SAVEPOINT, not the whole transaction: a plain `session.rollback()`
            # on the IntegrityError would discard *everything* pending on this
            # session, not just this one failed insert — including, in the
            # request path, the trace/span rows already added ahead of this call.
            try:
                with self.session.begin_nested():
                    self.session.add(
                        AgentMessageLog(
                            sender_slug=sender_slug,
                            recipient_slug=recipient_slug,
                            nonce=nonce,
                            signed=signature is not None,
                            agent_card_match=agent_card_match,
                            trace_id=trace.id if trace else None,
                        )
                    )
                    self.session.flush()
            except IntegrityError:
                replayed = True

        signature_valid: bool | None = None
        if signature is not None and agent is not None and not replayed:
            key_row = self.session.scalar(
                select(AgentSigningKey).where(
                    AgentSigningKey.agent_id == agent.id,
                    AgentSigningKey.revoked_at.is_(None),
                )
            )
            if key_row is None:
                signature_valid = False
            else:
                try:
                    raw_key = decrypt_secret(key_row.key_encrypted)
                    signature_valid = verify_message(
                        raw_key,
                        sender=sender_slug,
                        nonce=nonce,
                        payload=content,
                        timestamp=timestamp or 0.0,
                        signature=signature,
                        validity_seconds=self.settings.agent_message_validity_seconds,
                    )
                except DecryptionFailed:
                    signature_valid = False

        result = self.evaluate(
            agent=agent,
            identity=identity,
            content=content,
            surface="agent_message",
            trace=trace,
            taint_source="subagent",
            persist=persist,
        )

        if replayed:
            result.verdict = "block"
            result.effective_verdict = "block"
            result.reason = f"replayed message: (sender='{sender_slug}', nonce) was already seen"
            result.rules_fired.append(
                {
                    "rule_id": "agent_message.replay",
                    "effect": "block",
                    "reason": result.reason,
                    "controls": ["NOM-IAM-08"],
                }
            )
        elif not agent_card_match:
            effect = "escalate" if result.verdict == "allow" else result.verdict
            result.verdict = effect
            result.effective_verdict = effect
            result.rules_fired.append(
                {
                    "rule_id": "agent_message.agent_card_mismatch",
                    "effect": effect,
                    "reason": (
                        f"sender '{sender_slug}' is not a registered agent — "
                        "its agent-card cannot be verified"
                    ),
                    "controls": ["NOM-IAM-08"],
                }
            )
        elif signature_valid is False:
            effect = "block" if result.verdict != "block" else result.verdict
            result.verdict = effect
            result.effective_verdict = effect
            result.rules_fired.append(
                {
                    "rule_id": "agent_message.bad_signature",
                    "effect": effect,
                    "reason": "signature did not verify against the sender's registered signing key",
                    "controls": ["NOM-IAM-08"],
                }
            )
        elif signature is None:
            result.taint["unsigned"] = True
            result.rules_fired.append(
                {
                    "rule_id": "agent_message.unsigned",
                    "effect": "observe",
                    "reason": (
                        "message arrived unsigned — either the transport is not "
                        "Nometria's own, or the sender has no registered signing key"
                    ),
                    "controls": ["NOM-IAM-08"],
                }
            )

        if persist:
            log_row = self.session.scalar(
                select(AgentMessageLog)
                .where(AgentMessageLog.sender_slug == sender_slug, AgentMessageLog.nonce == nonce)
                .order_by(AgentMessageLog.created_at.desc())
            )
            if log_row is not None:
                log_row.signature_valid = signature_valid
                log_row.decision_id = result.decision_id

        return result

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

    def _disclosure_checks(
        self, agent: Agent | None, surface: str, content: str, trace_id: str | None
    ) -> dict[str, Any]:
        """P10 — what this human may see, and what the answer disclosed anyway.

        The pre-filter belongs to whoever performs retrieval, so it is exposed
        separately; this is the post-flight half, which catches the two disclosures no
        access check can — an aggregate over too few people, and an attribute the model
        inferred rather than retrieved.
        """
        if surface != "output" or not content:
            return {}
        evidence = self.evidence or {}
        principal = evidence.get("principal")
        chunks = evidence.get("chunks") or []
        issues: list[dict[str, Any]] = []
        out: dict[str, Any] = {}

        if principal is not None:
            decision = filter_retrieval(
                self.session,
                principal,
                chunks,
                purpose=evidence.get("purpose"),
            )
            record_disclosure(
                self.session,
                decision,
                trace_id=trace_id,
                agent_id=agent.id if agent else None,
                stage="post",
            )
            out["disclosure"] = decision.to_json()
            for withheld in decision.withheld:
                # A chunk the principal could not see, quoted in the answer, is the
                # oversharing failure itself rather than a near miss.
                text = str(withheld.get("text") or "")
                if text and text[:60] and text[:60] in content:
                    issues.append(
                        {
                            "type": "entitlement_disclosure",
                            "severity": "critical",
                            "title": (
                                f"the answer contains content from "
                                f"'{withheld.get('source')}', which "
                                f"'{decision.principal}' is not entitled to see"
                            ),
                        }
                    )

        aggregate = aggregation_risk(
            content,
            contributors=evidence.get("contributors"),
            k=self.settings.k_anonymity_threshold,
        )
        if aggregate:
            issues.append(
                {
                    "type": "aggregation_disclosure",
                    "severity": "high",
                    "title": aggregate["reason"],
                    **aggregate,
                }
            )

        inferred = inference_risk(content, " ".join(str(c.get("text") or "") for c in chunks))
        if inferred:
            issues.append(
                {
                    "type": "inference_disclosure",
                    "severity": "high",
                    "title": inferred["reason"],
                    **inferred,
                }
            )

        if issues:
            out["evidence_issues"] = [*out.get("evidence_issues", []), *issues]
        return out

    def _business_ladders(
        self,
        agent: Agent | None,
        surface: str,
        tool_key: str | None,
        arguments: dict[str, Any] | None,
    ) -> LadderDecision | None:
        """Evaluate the business ladders that apply to this call.

        Only on the tool-argument surface: a ladder bands a number the caller is about
        to act on, and there is no such number on an input or an output. When several
        apply, the strictest wins and the disagreement is a lint finding rather than a
        silent precedence rule — two authors disagreeing is a fact about the
        organisation, not a merge conflict.
        """
        if surface != "tool_args" or not arguments:
            return None
        try:
            ladders = load_ladders(
                self.session, tool=tool_key, agent_id=agent.id if agent else None
            )
        except Exception as exc:  # pragma: no cover - storage must not break the path
            log.warning("business ladders unavailable: %s", exc)
            return None
        if not ladders:
            return None

        request = {"arguments": arguments, "tool": tool_key}
        decisions = [
            evaluate_ladder(ladder, request)
            for ladder in ladders
            if ladder.tool in (None, tool_key)
        ]
        decisions = [d for d in decisions if d.matched or d.undecidable]
        if not decisions:
            return None
        return max(decisions, key=lambda d: BUSINESS_RANK.get(d.outcome, 0))

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

    def _raise_detection_finding(
        self,
        *,
        agent: Agent | None,
        trace_id: str | None,
        decision_id: str,
        surface: str,
        effective: str,
        reason: str,
        rules_fired: list[dict[str, Any]],
        detections: list,
    ) -> None:
        """The general-Findings counterpart to `_persist_detectors`.

        `DetectionFinding.sample` already carries a redacted excerpt — it just
        never left the trace it was captured on. This dedupes by entity type,
        keeping the highest-scoring sample for each, and reuses whichever
        controls the firing rules already declared rather than inventing a new
        control key for the same decision.
        """
        by_entity: dict[str, Any] = {}
        for detection in detections:
            current = by_entity.get(detection.entity_type)
            if current is None or detection.score > current.score:
                by_entity[detection.entity_type] = detection
        if not by_entity:
            return

        controls = sorted({c for r in rules_fired for c in (r.get("controls") or [])}) or [
            "NOM-RTG-06"
        ]
        entity_types = sorted(by_entity)
        severity = "high" if effective in ("block", "escalate") else "medium"

        self.session.add(
            Finding(
                type="guardrail_detection",
                severity=severity,
                title=f"{effective.capitalize()}ed on {surface}: {', '.join(entity_types)}",
                subject_type="agent",
                subject_id=agent.id if agent else None,
                evidence_json={
                    "trace_id": trace_id,
                    "decision_id": decision_id,
                    "surface": surface,
                    "verdict": effective,
                    "reason": reason,
                    "detections": [
                        {
                            "entity_type": d.entity_type,
                            "score": d.score,
                            "sample": d.sample,
                            "owasp_id": d.owasp_id,
                            "atlas_id": d.atlas_id,
                        }
                        for d in by_entity.values()
                    ],
                },
                control_keys=controls,
            )
        )

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
