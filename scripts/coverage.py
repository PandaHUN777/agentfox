#!/usr/bin/env python3
"""Compute implementation coverage against PRD v3 — do not hand-maintain it.

A status table written by hand drifts within a week and then quietly lies, which is
exactly the failure mode this product exists to prevent elsewhere. So each capability
declares a *probe* against the actual codebase, and the table is regenerated:

    python scripts/coverage.py            # print
    python scripts/coverage.py --write    # regenerate docs/status.md

A probe is deliberately shallow — it proves the capability is wired, not that it is
good. Depth is the test suite's job; this answers "does it exist at all".
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src" / "nometria"
TESTS = ROOT / "tests"

BUILT, PARTIAL, ABSENT = "built", "partial", "absent"
MARK = {BUILT: "✅", PARTIAL: "◐", ABSENT: "✗"}


@dataclass
class Probe:
    """One capability and how to detect it."""

    id: str
    name: str
    pillar: str
    #: substrings that must all appear somewhere under src/
    needs: list[str] = field(default_factory=list)
    #: if present, capability is at most `partial` until these appear too
    full: list[str] = field(default_factory=list)
    tests: str = ""
    note: str = ""


@dataclass
class Mode:
    """One catalogued failure mode and the marker that proves it is addressed.

    The 50 modes in `failure-modes.md` are the honest scorecard: pillars are how we
    organise the build, families are what actually goes wrong in production. A pillar
    can be "built" while the failure it exists to prevent is still uncovered, which is
    why this table is computed separately rather than derived from the pillar rows.
    """

    id: str
    name: str
    #: substrings that must all appear under src/ for this mode to count as covered
    needs: list[str] = field(default_factory=list)
    #: covered but only in part — the marker exists, the mode is not fully addressed
    partial: bool = False
    note: str = ""


FAMILIES: dict[str, tuple[str, list[Mode]]] = {
    "F1": (
        "Answerability & abstention",
        [
            Mode("F1.1", "Answers an unknowable question", ["def classify_answerability"]),
            Mode("F1.2", "Answers outside the coverage window", ["def _temporal_scope"]),
            Mode("F1.3", "Answers for an out-of-scope entity", ["def _entity_scope"]),
            Mode("F1.4", "Prediction presented as record", ["PREDICTION_MARKERS"]),
            Mode("F1.5", "Over-refusal", ["def detect_over_refusal"]),
            Mode("F1.6", "Partial answer presented as complete", ["def completeness_signal"]),
        ],
    ),
    "F2": (
        "Source authority & provenance",
        [
            Mode("F2.1", "Unauthoritative source", ["def source_tier"]),
            Mode("F2.2", "Stale source", ["def freshness_breach"]),
            Mode("F2.3", "Fabricated citation", ["def detect_fabricated_citations"]),
            Mode("F2.4", "Contradictory sources, silent pick", ["def detect_source_conflict"]),
            Mode("F2.5", "Uncited assertion", ["class GroundednessScorer"]),
            Mode("F2.6", "Source outside declared domain", ["def domain_breach"]),
        ],
    ),
    "F3": (
        "Destructive action",
        [
            Mode("F3.1", "Destructive DML", ["sql.unbounded_mutation"]),
            Mode("F3.2", "DDL / schema change", ["sql.destructive_ddl"]),
            Mode("F3.3", "Unbounded blast radius", ["def _is_tautology"]),
            Mode("F3.4", "Wrong environment", ["def environment_risk"]),
            Mode("F3.5", "Comment / stacked-statement evasion", ["sql.stacked_statements"]),
            Mode("F3.6", "Irreversible act on unverified state", ["def _verified_state_gate"]),
            Mode("F3.7", "Duplicate execution on retry", ["def idempotency_key"]),
            Mode("F3.8", "Composed privilege escalation", ["sql.privilege_change"]),
            Mode("F3.9", "Cascading side effects", ["def _cascade_risk"]),
            Mode("F3.10", "Partial completion, no rollback", ["def compensation_plan"]),
        ],
    ),
    "F4": (
        "Entitlement & disclosure",
        [
            Mode("F4.1", "Oversharing via retrieval", ["def filter_retrieval"]),
            Mode("F4.2", "Agent identity ≠ user entitlement", ["def end_user_principal"]),
            Mode("F4.3", "Cross-tenant leakage", ["def tenant_breach"]),
            Mode("F4.4", "Aggregation disclosure", ["def aggregation_risk"]),
            Mode("F4.5", "Inference disclosure", ["def inference_risk"]),
            Mode("F4.6", "Purpose limitation breach", ["def purpose_breach"]),
            Mode("F4.7", "MNPI / blackout / legal hold", ["def restricted_window"]),
            Mode(
                "F4.8",
                "Residency violation",
                ["allow_egress"],
                partial=True,
                note="deployment-level only; no per-record residency",
            ),
        ],
    ),
    "F5": (
        "Escalation & resolution",
        [
            Mode("F5.1", "Failed to escalate", ["def detect_missed_escalation"]),
            Mode("F5.2", "Escalated without context", ["def handoff_completeness"]),
            Mode("F5.3", "Loops instead of escalating", ["def _loop_without_handoff"]),
            Mode("F5.4", "Turn-depth degradation", ["def turn_depth_risk"]),
            Mode("F5.5", "False resolution", ["def detect_false_resolution"]),
            Mode("F5.6", "Dropped hand-off", ["def breached_handoffs"]),
            Mode("F5.7", "Sentiment / urgency blindness", ["def sentiment_signal"]),
        ],
    ),
    "F6": (
        "Commitment, advice & liability",
        [
            Mode("F6.1", "Binding commitment", ["def detect_commitments"]),
            Mode(
                "F6.2",
                "Unlicensed advice",
                ["class SafetyLexiconDetector"],
                partial=True,
                note="lexicon only; no licensed-advice classifier",
            ),
            Mode("F6.3", "Missing AI disclosure", ["def disclosure_required"]),
            Mode("F6.4", "Adverse action without reason", ["def adverse_action_risk"]),
            Mode("F6.5", "Discriminatory outcome", ["def fairness_probe"]),
            Mode("F6.6", "Decision not recorded", ["class Decision"]),
        ],
    ),
    "F7": (
        "Numeric, temporal & entity integrity",
        [
            Mode("F7.1", "Hallucinated record match", ["def detect_unmatched_records"]),
            Mode("F7.2", "Arithmetic / aggregation error", ["def check_arithmetic"]),
            Mode("F7.3", "Wrong period", ["def detect_period_mismatch"]),
            Mode("F7.4", "Unit / currency error", ["def detect_unit_mismatch"]),
            Mode("F7.5", "Entity confusion", ["def detect_entity_confusion"]),
            Mode("F7.6", "Timezone error", ["def detect_timezone_ambiguity"]),
            Mode("F7.7", "Self-contradiction across turns", ["class SelfConsistencyScorer"]),
        ],
    ),
    "F8": (
        "Context & retrieval integrity",
        [
            Mode("F8.1", "Incoherent chunks", ["def chunk_quality"]),
            Mode("F8.2", "Tokeniser / script boundary failures", ["def script_compatibility"]),
            Mode("F8.3", "Stale index", ["def index_freshness"]),
            Mode("F8.4", "Context-window truncation", ["def truncation_risk"]),
            Mode("F8.5", "Memory contamination", ["def memory_contamination"]),
            Mode("F8.6", "Retrieval quality drift", ["def retrieval_quality"]),
            Mode("F8.7", "Ingestion corruption", ["def ingestion_gate"]),
        ],
    ),
}


def _src_text() -> str:
    return "\n".join(p.read_text(errors="ignore") for p in SRC.rglob("*.py"))


def _count_tests(pattern: str) -> int:
    if not pattern:
        return 0
    total = 0
    for path in TESTS.rglob("test_*.py"):
        body = path.read_text(errors="ignore")
        # The group around `pattern` is load-bearing: without it an alternation binds
        # looser than the `test_` prefix and every branch after the first is silently
        # missed, which understated half the table.
        total += len(re.findall(rf"def test_\w*(?:{pattern})\w*", body))
    return total


PROBES: list[Probe] = [
    # --- Layer A: Know
    Probe(
        "P1",
        "Registry, shadow discovery, observed lineage",
        "1 Registry",
        ["def observe_agent", "def detect_shadow_agents", "def derive_lineage"],
        ["def sync_connector"],
        "shadow|lineage|inventory",
        "connector-based estate discovery (P1-8) absent",
    ),
    Probe(
        "P12",
        "Hierarchical policy, override semantics, lint",
        "12 Policy Composition",
        ["class PolicyDocument", "def resolve_effective", "def lint_policy"],
        ["def canary_rollout"],
        "policy|hierarchy",
        "canary rollout (P12-6) and non-developer authoring (P12-7) absent",
    ),
    # --- Layer B: Constrain
    Probe(
        "P2",
        "NHI, least privilege, delegation narrowing, approvals",
        "2 Identity",
        ["def check_capability", "def delegate", "def request_approval"],
        ["def link_external_identity"],
        "capability|delegation|approval",
        "no live IdP; Entra/Okta integration (P2-8) absent",
    ),
    Probe(
        "P3",
        "Runtime detectors across five surfaces + taint",
        "3 Guardrails",
        [
            "class InjectionHeuristicDetector",
            "class NativePiiDetector",
            "class SecretsDetector",
            "class TaintTracker",
            "def explain",
            "class LatencyLedger",
            "def record_feedback",
        ],
        ["class GraniteGuardianDetector"],
        "injection|pii|secret|taint|explain|ledger|suppress|precision|latency",
        "model-based detectors wired but need an opt-in weights download",
    ),
    Probe(
        "P9",
        "Action semantics, blast radius, verified-state preconditions",
        "9 Action Assurance",
        ["def analyse_sql", "class ActionAnalysis", "def _verified_state_gate"],
        ["def idempotency_key"],
        "action|blast_radius|destructive|tautolog|unbounded|verified_state|dry_run",
        "idempotency keys (P9-8) absent",
    ),
    Probe(
        "P10",
        "End-user principal, retrieval entitlement filtering",
        "10 Entitlement",
        ["def resolve_principal"],
        [],
        "entitlement|principal|overshar",
    ),
    # --- Layer C: Ground
    Probe(
        "P7",
        "Knowledge boundary, forced abstention",
        "7 Answerability",
        [
            "class KnowledgeBoundary",
            "def classify_answerability",
            "def detect_over_refusal",
            "def verify_boundary",
        ],
        [],
        "answerab|abstain|boundary|refus|completeness|question_type|coverage_window",
    ),
    Probe(
        "P8",
        "Source tiers, freshness, citation binding",
        "8 Provenance",
        [
            "def groundedness",
            "class SourceRecord",
            "def detect_fabricated_citations",
            "def freshness_breach",
        ],
        ["def ingest_catalog"],
        "groundedness|provenance|citation|source|freshness|tier|conflict",
        "catalog ingestion (P8-9: DataHub/OpenMetadata/Unity) absent",
    ),
    Probe(
        "P14",
        "Ingestion and retrieval quality gates",
        "14 Context Integrity",
        ["def chunk_quality"],
        [],
        "chunk_quality|retrieval_metric",
    ),
    # --- Layer D: Judge
    Probe(
        "P4",
        "Eval runner, CI gating, drift, silent failure, red team",
        "4 Evaluation",
        ["def gate", "class SilentFailureScorer", "def compute", "def run_campaign"],
        ["class RagasAdapter", "def annotation_queue"],
        "gate|silent_failure|drift|campaign",
        "no Ragas adapter, model-based groundedness or annotation queue",
    ),
    Probe(
        "P13",
        "Failure attribution across handoffs",
        "13 Failure Attribution",
        ["def attribute_failure"],
        [],
        "attribution|handoff_fidelity",
    ),
    Probe(
        "P11",
        "Escalation policy and missed-escalation detection",
        "11 Escalation",
        [
            "def request_approval",
            "def detect_missed_escalation",
            "def handoff_completeness",
            "def detect_false_resolution",
            "def breached_handoffs",
        ],
        [],
        "escalation|handoff|missed_escalation|false_resolution|sentiment|abstention|turn_depth",
    ),
    # --- Layer E: Prove
    Probe(
        "P5",
        "Traces, hash chain, evidence packages, SIEM",
        "5 Audit",
        ["def verify", "def build", "def to_cef", "def full_trace"],
        [],
        "chain|evidence|trace|siem",
    ),
    Probe(
        "P6",
        "Control catalog, computed status, risk, obligations",
        "6 Compliance",
        ["def compute_all", "def sync_catalog", "def obligation_calendar"],
        ["def dynamic_risk_score", "class Assessment"],
        "control|framework|compliance|risk",
        "dynamic risk scoring and workflow engine absent (Gartner criteria)",
    ),
    # --- Cross-cutting
    Probe(
        "P15",
        "Circuit breaker, fallback, caps, backpressure",
        "15 Cost & Reliability",
        ["class CircuitBreaker", "class FallbackLadder", "def check_budget"],
        ["def apply_backpressure"],
        "reliability|breaker|budget",
        "backpressure/queue shedding (P15-6) absent; caps are hard stops only",
    ),
    # --- Platform
    Probe(
        "PL-1",
        "Streaming with inline enforcement",
        "Platform",
        ["def run_completion_stream", "class StreamChunk", "def _stream_openai"],
        [],
        "stream",
    ),
    Probe(
        "PL-2",
        "Database migrations",
        "Platform",
        ["def upgrade_db", "def current_revision"],
        [],
        "migration",
    ),
    Probe(
        "PL-3",
        "Kill switch and quarantine",
        "Platform",
        ["class AgentControl", "def _control_verdict"],
        [],
        "kill|quarantine|control_",
    ),
    Probe("PL-4", "Agent loop governance", "Platform", ["def govern_loop"], [], ""),
    Probe("PL-5", "Async workers", "Platform", ["class JobQueue"], [], ""),
    Probe(
        "PL-6",
        "HA-ready persistence",
        "Platform",
        ["def configure_pool"],
        [],
        "",
        "Postgres supported; scale-out untested",
    ),
    Probe("PL-7", "Service-level fail-open", "Platform", ["def service_fallback"], [], ""),
    # --- Integrations
    # --- Adoption surface: the reason any of the above gets installed at all.
    Probe(
        "PL-8",
        "Tenant isolation enforced at the session",
        "Platform",
        ["class TenantScoped", "def _tenant_criteria", "def system_scope"],
        [],
        "tenant|tenancy|cross_tenant|isolat",
    ),
    Probe(
        "X-1",
        "One-line auto-instrumentation",
        "Adoption",
        ["def auto", "def _patch_openai", "def _patch_anthropic"],
        ["def _patch_langchain"],
        "auto|autoguard|one_liner|untouched_app|patch",
        "LangChain/LiteLLM client patching absent",
    ),
    Probe(
        "X-2",
        "Static repo discovery and zero-effort CLI",
        "Adoption",
        ["def scan_file", "def check", "def doctor"],
        [],
        "scan|discovery|doctor|init_is_idempotent|quickstart|ungoverned",
    ),
    Probe(
        "X-3",
        "Control-plane onboarding and attention-first home",
        "Adoption",
        ["def onboarding", "def attention"],
        [],
        "checklist|attention|connected|onboarding",
    ),
    Probe(
        "I-1",
        "LangGraph-native SDK",
        "Integration",
        ["class NometriaGuard"],
        [],
        "langgraph|guard_",
    ),
    Probe(
        "I-2",
        "MCP inline governance",
        "Integration",
        ["def scan_mcp_server", "class McpGovernor", "def _check_drift"],
        [],
        "mcp|drift|undeclared|poison",
    ),
    Probe(
        "I-3",
        "FastAPI middleware and dependency",
        "Integration",
        ["class NometriaMiddleware", "def guard", "def install"],
        [],
        "fastapi|middleware|dependency_governs|one_line_install|governed_route",
    ),
    Probe(
        "I-4",
        "LangSmith correlation",
        "Integration",
        ["def refs_from_headers", "def _push_langsmith", "def resolve_external"],
        [],
        "correlat|langsmith|traceparent",
    ),
    Probe("I-5", "OpenTelemetry", "Integration", ["def ingest_otlp"], [], "otlp"),
    Probe(
        "I-6",
        "Langfuse correlation",
        "Integration",
        ["def link_trace", "def _push_langfuse", "def deep_link"],
        [],
        "correlat|langfuse|reverse_lookup",
    ),
    Probe(
        "I-7",
        "Prometheus export",
        "Integration",
        ["def render_metrics"],
        ["def push_to_gateway"],
        "metric|prometheus|scrape|observe_mode_is_reported",
    ),
    Probe(
        "I-8",
        "Ragas scorer adapter",
        "Integration",
        ["class RagasSample", "def score_dataset", "def ragas_available"],
        [],
        "ragas|faithfulness|vocabulary|implementation|dataset_report",
    ),
    Probe(
        "I-10",
        "LiteLLM routing",
        "Integration",
        ["class LiteLLMProvider"],
        [],
        "litellm",
    ),
    Probe(
        "I-11",
        "Azure / Bedrock / Vertex providers",
        "Integration",
        ["class BedrockProvider", "class AzureOpenAIProvider", "class VertexProvider"],
        [],
        "azure|bedrock|vertex|enterprise_provider|system_prompts_are_lifted",
    ),
]


def evaluate(probe: Probe, blob: str) -> tuple[str, int]:
    tests = _count_tests(probe.tests)
    if not probe.needs or not all(n in blob for n in probe.needs):
        return ABSENT, tests
    if probe.full and not all(n in blob for n in probe.full):
        return PARTIAL, tests
    if probe.note and not probe.full:
        return PARTIAL, tests
    return BUILT, tests


def evasion_score_line() -> str:
    """Measured recall against the adversarial corpus, not asserted.

    A detector's quality is the one thing a probe genuinely cannot see — `grep` finds
    the class, not whether it works — so this runs the corpus.
    """
    try:
        sys.path.insert(0, str(ROOT))
        from nometria.guardrails import all_detectors
        from nometria.guardrails.base import DetectionContext
        from tests.corpus.injection import ATTACKS, BENIGN

        detector = all_detectors()["injection.heuristic"]
        context = DetectionContext(surface="tool_result", taint_source="tool_result")

        def fires(text: str) -> bool:
            return bool(detector.detect(text, context).detections)

        caught = sum(1 for case in ATTACKS if fires(case.text))
        false_positives = sum(1 for case in BENIGN if fires(case.text))
        return (
            f"| **Injection recall** | **{caught / len(ATTACKS):.0%}** — {caught}/{len(ATTACKS)} "
            f"adversarial, {false_positives} false positive(s) on {len(BENIGN)} benign |"
        )
    except Exception as exc:  # pragma: no cover - reporting must not break the report
        return f"| **Injection recall** | not measured ({exc}) |"


def family_rows(blob: str) -> tuple[list[str], int, int, int]:
    """Score the 50 catalogued failure modes. This is the scorecard that matters."""
    rows: list[str] = []
    covered = partial = total = 0
    for key, (title, modes) in FAMILIES.items():
        hit = [m for m in modes if all(n in blob for n in m.needs)]
        full = [m for m in hit if not m.partial]
        part = [m for m in hit if m.partial]
        covered += len(full)
        partial += len(part)
        total += len(modes)
        missing = [m.id for m in modes if m not in hit]
        score = len(full) + 0.5 * len(part)
        mark = MARK[BUILT] if score == len(modes) else MARK[PARTIAL] if score else MARK[ABSENT]
        rows.append(
            f"| **{key}** {title} | {len(modes)} | {len(full)} | {len(part)} | "
            f"{mark} {score:g}/{len(modes)} | {', '.join(missing) or '—'} |"
        )
    return rows, covered, partial, total


def render() -> str:
    blob = _src_text()
    rows, tally = [], {BUILT: 0, PARTIAL: 0, ABSENT: 0}
    for probe in PROBES:
        status, tests = evaluate(probe, blob)
        tally[status] += 1
        rows.append(
            f"| `{probe.id}` | {probe.pillar} | {probe.name} | {MARK[status]} {status} | "
            f"{tests or '—'} | {probe.note or ''} |"
        )

    total = sum(tally.values())
    try:
        out = subprocess.run(
            [sys.executable, "-m", "pytest", "--collect-only", "-q"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=180,
        ).stdout
        collected = re.search(r"(\d+) tests? collected", out)
        test_total = collected.group(1) if collected else "?"
    except Exception:
        test_total = "?"

    loc = sum(
        len(p.read_text(errors="ignore").splitlines())
        for p in list(SRC.rglob("*.py")) + list(TESTS.rglob("*.py"))
    )

    pct = round(100 * (tally[BUILT] + 0.5 * tally[PARTIAL]) / total)
    frows, fcovered, fpartial, ftotal = family_rows(blob)
    evasion = evasion_score_line()
    fpct = round(100 * (fcovered + 0.5 * fpartial) / ftotal)
    return f"""# Implementation status

**Generated by `python scripts/coverage.py --write` — do not edit by hand.**

A hand-written status table drifts within a week and then quietly lies. Each row below
is a probe against the actual codebase, so this file cannot claim something that is not
there. Probes are shallow by design: they prove a capability is *wired*, not that it is
*good*. Depth is the test suite's job.

| | |
|---|---|
| **Capabilities** | {total} tracked |
| **Built** | {tally[BUILT]} ✅ |
| **Partial** | {tally[PARTIAL]} ◐ |
| **Absent** | {tally[ABSENT]} ✗ |
| **Weighted coverage** | **{pct}%** *(partial counts half)* |
| **Tests** | {test_total} |
| **Lines** | {loc:,} (src + tests) |
| **Failure modes covered** | **{fpct}%** — {fcovered} of {ftotal} outright, {fpartial} partial |
{evasion}

Requirement detail lives in [PRD v3](PRD-v3-consolidated.md); requirement→test mapping
in [traceability.md](traceability.md).

| ID | Pillar | Capability | Status | Tests | Note |
|---|---|---|---|---|---|
{chr(10).join(rows)}

## Failure-family coverage

Pillars are how the build is organised; **families are what actually goes wrong in
production**. A pillar can read "built" while the failure it exists to prevent is still
uncovered, so this table is computed independently rather than derived from the rows
above. The 50 modes come from [failure-modes.md](failure-modes.md).

| Family | Modes | Covered | Partial | Score | Not yet covered |
|---|---|---|---|---|---|
{chr(10).join(frows)}

**Reading the gaps.** Absent rows are not oversights — they are the PRD v3 roadmap in
tranche order. `P9`, `P13` and `P7` are the three genuinely unclaimed capabilities and
sit in Tranche 2; `P10` is the highest commercial value and sits in Tranche 3.
"""


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    body = render()
    if args.write:
        (ROOT / "docs" / "status.md").write_text(body)
        print("wrote docs/status.md")
    else:
        print(body)
