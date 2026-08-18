# Nometria Control Plane

**Agent-native, vendor-neutral governance, security and compliance for AI agents in production.**

See every agent, control what it can do, prove it works, and demonstrate compliance — across every model, framework and cloud.

> **Status: MVP v0.2 — Tranche 0 delivered.** Streaming enforcement, migrations, kill switch and a LangGraph-native SDK now ship.
>
> **Previously v0.1:** A thin, functional slice across all six product pillars. Runs offline with no API key and no model weights. Not production-hardened. See [docs/PRD.md](docs/PRD.md) §6 for exactly what is and is not built.

---

## Why this exists

Enterprises deploying agents are stuck between two camps that each own half the problem. GRC incumbents (Credo AI, OneTrust, ModelOp) own policy, registry and framework mapping but were built for the *model* era — no runtime enforcement, no execution paths, no evaluation. Agent-security tools (Arthur, Zenity, Lakera, Prisma AIRS, Agent 365) own runtime guardrails but are thin on compliance and several are locked to one vendor's model, cloud or security suite.

The defensible middle is a **vendor-neutral, agent-native control plane that unifies runtime security + reliability/evaluation + tamper-evident audit + compliance mapping** — which a model provider cannot build without a conflict of interest, a GRC incumbent cannot retrofit, and a point-security tool does not attempt.

Full reasoning, evidence and roadmap: **[docs/PRD.md](docs/PRD.md)**.

## The six pillars

| # | Pillar | Answers | Built on |
|---|---|---|---|
| 1 | Discovery & Agent Registry | *What agents do we have?* | ours |
| 2 | Identity, Access & Authorization | *What is it allowed to touch?* | **OPA/Rego** + ours |
| 3 | Runtime Guardrails & Security | *Stop the bad thing* | **Presidio**, **Granite Guardian**, **NeMo/Guardrails AI** + ours |
| 4 | Evaluation & Reliability | *Does it actually work?* | **promptfoo**, **Garak**, **PyRIT** + ours |
| 5 | Audit & Traceability | *Show me what happened* | **OpenTelemetry** + ours |
| 6 | Policy & Compliance | *Prove we meet the rules* | ours — essentially no OSS exists here |

**Build-vs-reuse rule:** wrap the primitive, own the interface. ~20% of engineering integrates OSS; ~80% goes above the value line. Every wrapped project sits behind a swappable adapter — see [Appendix A](docs/appendix-a-oss-register.md), which also records *why* LLM Guard (archived), Invariant/mcp-scan (Snyk-owned), Llama Guard (non-OSI licence) and systemprompt-core (BSL) are deliberately **off** the critical path.

## Quick start

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
```

Seed a demo environment and run the end-to-end demo:

```bash
nometria seed && nometria demo
```

Start the control plane (gateway + API on :8080):

```bash
nometria serve
```

Everything above runs **offline**: no API key, no downloaded weights, no network egress. The `echo` model provider makes the whole enforcement path demonstrable with nothing installed. Add real capability as configuration:

```bash
pip install -e ".[all]"      # Presidio, Granite Guardian, Garak, PyRIT, OTel, Postgres
```

Or bring up the full stack (gateway, OPA sidecar, Postgres, dashboard):

```bash
docker compose -f deploy/docker-compose.yml up
```

## What the demo shows

`nometria demo` walks the request path in PRD §9.3 and prints each step:

1. An agent makes a normal call → **allowed**, traced.
2. A retrieved document carries an **indirect prompt injection** → detected, tainted, blocked.
3. The injected instruction tries to reach `payments.transfer` with a **tainted argument** → contained by policy even though the payload got through, because a high-impact tool cannot take untrusted arguments unapproved.
4. An **unregistered agent** appears at the gateway → shadow-agent finding raised.
5. A **PII leak** in an outbound response → redacted.
6. An eval suite runs with **silent-failure scorers** → a plausible-but-ungrounded answer is caught and the CI gate fails.
7. The **audit chain is verified**, then tampered with, then verified again → the break is located.
8. An **auditor evidence package** is exported with a manifest and chain-of-custody.

## CLI

```bash
nometria seed                     # demo agents, policies, controls, obligations
nometria serve                    # gateway + control-plane API
nometria demo                     # end-to-end walkthrough
nometria agents list
nometria eval gate --suite support-quality --baseline main   # CI regression gate (exit 1 on regression)
nometria policy simulate --policy payments --file candidate.yaml
nometria audit verify
nometria evidence export --agent support-triage --from 2026-08-01 --to 2026-08-17
nometria redteam run --agent support-triage
nometria agents quarantine support-triage --reason "investigating"   # PL-3 kill switch
nometria agents resume support-triage
nometria db upgrade                                                  # PL-2 migrations
nometria compliance status --framework eu-ai-act
nometria scan mcp --server internal-tools
```

## LangGraph integration (the primary adoption path)

```python
from nometria.integrations.langgraph import NometriaGuard

guard = NometriaGuard(agent="support-triage", intent="answer a refund question")

builder.add_node("retrieve", guard.retrieval_node(fetch_docs))     # indirect injection blocked
builder.add_node("model",    guard.model_node(call_model))          # in + out enforced, traced
builder.add_node("pay",      guard.tool_node(transfer, tool="payments.transfer"))
```

Trace identity lives in graph state so it survives checkpointing and resumption.
Escalation maps to LangGraph's own `interrupt()` — one pause mechanism, not two.

## Documentation

| | |
|---|---|
| **[PRD (consolidated) ★](docs/PRD-consolidated.md)** | **Start here.** Self-contained: all 11 pillars, with references, OSS options, commercial alternatives and industry state of the art per pillar |
| **[Implementation status](docs/status.md)** | **Computed coverage — regenerate with `python scripts/coverage.py --write`** |
| **[PRD v3 — CONSOLIDATED](docs/PRD-v3-consolidated.md)** | **Canonical. Self-contained: evidence, market, 15 pillars with OSS + commercial alternatives per pillar, roadmap** |
| [PRD v1](docs/PRD.md) | Historical — the original six pillars |
| [PRD v2](docs/PRD-v2.md) | Historical — the agent-assurance delta |
| **[Practitioner signal](docs/practitioner-signal.md)** | **What 11 senior AI engineers actually built** — tech graph, integration surface, and the 6-of-11 finding |
| **[Failure-mode analysis](docs/failure-modes.md)** | **How deployed agents actually fail** — 50 modes, 7 families, grounded in 10k+ catalogued incidents |
| [Gap analysis](docs/gap-analysis.md) | Enterprise readiness & competitive position — audited, severity-ranked |
| [Appendix A](docs/appendix-a-oss-register.md) | OSS dependency register — licence, health, verdict, our exposure |
| [Appendix B](docs/appendix-b-control-catalog.md) | 36 controls mapped to EU AI Act, NIST AI RMF, ISO 42001, SOC 2, OWASP LLM & Agentic, MITRE ATLAS |
| [Appendix C](docs/appendix-c-api-spec.md) | API specification |
| [Appendix D](docs/appendix-d-data-model.md) | Data model |
| [Appendix E](docs/appendix-e-threat-model.md) | Threat model — threats to the customer's agents, and to us |
| [Traceability](docs/traceability.md) | Every requirement → the module that implements it |

## Honest limits

- **Compliance mappings are DRAFT.** Produced from framework texts by engineers, not reviewed by compliance counsel. The product badges them as such and excludes drafts from evidence packages. See [Appendix B §B.6](docs/appendix-b-control-catalog.md#b6-mapping-review-gate).
- **Coverage gaps are declared, not hidden.** Appendix B §B.4 lists what each framework mapping does *not* cover; Appendix E §E.3 does the same for threats.
- **This is an MVP.** Single-org, no live IdP, no scheduled red-team campaigns, text modalities only. PRD §6.3 has the full list.

## Licence

Apache-2.0. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
