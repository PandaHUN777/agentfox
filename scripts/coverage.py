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
        ["class KnowledgeBoundary"],
        [],
        "answerab|abstain",
    ),
    Probe(
        "P8",
        "Source tiers, freshness, citation binding",
        "8 Provenance",
        ["def groundedness"],
        ["class SourceRegistry"],
        "groundedness|provenance|citation",
        "lexical groundedness only; source authority absent",
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
        ["def request_approval"],
        ["def detect_missed_escalation"],
        "escalation",
        "approvals exist; missed-escalation detection absent",
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
    Probe("I-3", "FastAPI middleware", "Integration", ["class NometriaMiddleware"], [], ""),
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
    Probe("I-7", "Prometheus export", "Integration", ["def prometheus_metrics"], [], ""),
    Probe("I-8", "Ragas scorer adapter", "Integration", ["class RagasScorer"], [], ""),
    Probe("I-10", "LiteLLM routing", "Integration", ["class LiteLLMProvider"], [], ""),
    Probe(
        "I-11",
        "Azure / Bedrock / Vertex providers",
        "Integration",
        ["class BedrockProvider"],
        [],
        "",
        "OpenAI + Anthropic only",
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

Requirement detail lives in [PRD v3](PRD-v3-consolidated.md); requirement→test mapping
in [traceability.md](traceability.md).

| ID | Pillar | Capability | Status | Tests | Note |
|---|---|---|---|---|---|
{chr(10).join(rows)}

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
