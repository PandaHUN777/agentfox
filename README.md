# Nometria Control Plane

**Your agent cannot take an action it was never entitled to take — even when the model is fooled.**

Agent-native, vendor-neutral governance, security and compliance for AI agents in production: see every
agent, bound what it can do, prove it works, and demonstrate compliance — across every model, framework
and cloud.

---

## Try it — zero install, nothing leaves your machine

```bash
curl -fsSL https://raw.githubusercontent.com/architsharm/guardrails/main/scripts/quickscan.sh | bash
```

This is the lowest-friction way to see whether this is worth your time: no account, no clone, no config. It installs into a throwaway virtualenv (removed on exit), scans the current directory for agent code, checks what's actually running via local AI-tool session transcripts, and runs a handful of known-adversarial prompts through the real detector pipeline right in your terminal — so "we catch prompt injection" is something you watch happen, not something we said. Nothing talks to anything but PyPI/GitHub (to fetch the package) and your local filesystem.

---

## Real usage — thirty seconds

```bash
pip install git+https://github.com/architsharm/guardrails.git   # not on PyPI yet
nometria init          # database, controls, baseline policy — offline, idempotent
nometria check         # scan this repo: what talks to a model, and what is ungoverned
```

Then one line in your entry point:

```python
import nometria
nometria.auto()
```

Every model call in the process — OpenAI, Anthropic, LiteLLM or LangChain, sync or async,
streamed or not — is now traced, evaluated against policy and written to a tamper-evident
audit log. **Nothing else in your codebase changes, and no model call is blocked**: `auto()`
follows each policy's own mode, and the `baseline` policy that governs model traffic starts
in observe, because a library that begins refusing production traffic because someone added
an import is indefensible. (`init` tells you which packs enforce from day one:
`tool-containment` does, for tool calls with untrusted arguments.)

```bash
nometria findings      # what it found
nometria doctor        # is the runtime configured the way you think it is?
```

When the findings look right, `nometria policy enforce baseline` is the one step that
starts blocking — `auto()` picks it up with no code change. Everything before it is safe to
run without reading further. `auto(mode="observe")` pins a process to never raising.

> **Status: MVP v0.3 — Tranches 0 and 1 delivered, Tranche 2 in progress.** Live
> coverage, computed by probe rather than asserted: **[docs/status.md](docs/status.md)**.

---

## Why this exists

Enterprises deploying agents are stuck between two camps that each own half the problem. GRC incumbents (Credo AI, OneTrust, ModelOp) own policy, registry and framework mapping but were built for the *model* era — no runtime enforcement, no execution paths, no evaluation. Agent-security tools (Arthur, Zenity, Lakera, Prisma AIRS, Agent 365) own runtime guardrails but are thin on compliance and several are locked to one vendor's model, cloud or security suite.

The defensible middle is a **vendor-neutral, agent-native control plane that unifies runtime security + reliability/evaluation + tamper-evident audit + compliance mapping** — which a model provider cannot build without a conflict of interest, a GRC incumbent cannot retrofit, and a point-security tool does not attempt.

Full reasoning, evidence and roadmap: **[docs/PRD.md](docs/PRD.md)**.

## What's ours, and what we wrap

This isn't a bundle of open-source scanners with a UI on top. Roughly 20% of the engineering integrates OSS primitives; **80% is proprietary logic above them** — the part that's actually ours to sell, and the part we intend to be compensated for as this moves toward a paid product.

| | Examples | Status |
|---|---|---|
| **Wrapped OSS primitives** — the raw detection/policy engines | Presidio (PII), Granite Guardian, sqlglot (SQL parsing), OPA/Rego (policy), OpenTelemetry (tracing) | Swappable behind our own adapter interface — see [Appendix A](docs/appendix-a-oss-register.md) |
| **Proprietary, built by us** — the logic that turns a primitive into a governance decision | Argument-provenance taint tracking · deterministic blast-radius/action-semantics analysis on generated SQL · answerability & abstention against a declared knowledge boundary · end-user entitlement propagation through retrieval and tool calls · escalation-failure counterfactual detection · the tamper-evident audit chain and its independent verifier · the PIGuard+backstop ensemble tuning that drives our own injection-detection numbers (see Benchmarks below) | This is the moat — none of it exists as an off-the-shelf OSS or commercial primitive today; see [docs/PRD.md §1.4](docs/PRD.md#14-what-is-genuinely-differentiated--and-what-is-not) for what's genuinely unclaimed vs. contested |

**Build-vs-reuse rule:** wrap the primitive, own the interface. Every wrapped project sits behind a swappable adapter — see [Appendix A](docs/appendix-a-oss-register.md), which also records *why* LLM Guard (archived), Invariant/mcp-scan (Snyk-owned), Llama Guard (non-OSI licence) and systemprompt-core (BSL) are deliberately **off** the critical path.

### The six pillars

| # | Pillar | Answers | Built on |
|---|---|---|---|
| 1 | Discovery & Agent Registry | *What agents do we have?* | ours |
| 2 | Identity, Access & Authorization | *What is it allowed to touch?* | **OPA/Rego** + ours |
| 3 | Runtime Guardrails & Security | *Stop the bad thing* | **Presidio**, **Granite Guardian**, **NeMo/Guardrails AI** + ours |
| 4 | Evaluation & Reliability | *Does it actually work?* | **promptfoo**, **Garak**, **PyRIT** + ours |
| 5 | Audit & Traceability | *Show me what happened* | **OpenTelemetry** + ours |
| 6 | Policy & Compliance | *Prove we meet the rules* | ours — essentially no OSS exists here |

## What we claim, and what we don't

**We do not claim adversarial robustness, and we don't believe anyone can.** [*The Attacker Moves
Second*](https://arxiv.org/abs/2510.09023) (Nasr, Carlini, Schulhoff et al., 2025) reports **over 90%
attack success against twelve published defences** once the attacker is allowed to adapt. Our detectors
are no exception, and we measure it against ourselves: an
[adaptive search-based attacker](benchmarks/adaptive/README.md) that reads our verdict and tries again
gets **73% of the attacks we catch through within 50 attempts**, using only mutations a model can still
read. Our held-out injection recall is **66.7%**, published in full rather than rounded up, along with
the over-defense cost it carries. Building that benchmark found three real bugs in our own detectors,
now fixed: benign false positives on the standard over-defense set fell from **8.6% to 0.3%**, and it
turned out some prior "detections" were nothing but curly apostrophes.

**What we do claim is that the blast radius is bounded when detection fails.** That claim is measured
two ways, both with **every detector switched off** — a total bypass, not a simulated miss:

| Evidence | Result |
|---|---|
| [Containment under total detector bypass](benchmarks/containment/README.md) | **8/8 attacks contained with zero detector signal**; 4/4 legitimate calls still allowed |
| [AgentDojo replayed end to end](benchmarks/agentdojo_e2e/README.md), 617 ground-truth calls | **42/42 attacker calls that act, contained**; **552/552 legitimate calls allowed**; identical with detectors disabled |

In both, detection contributed nothing. Capability grants, argument provenance and declared impact tiers
did the work — which is the whole design. Read the honest limits in each: AgentDojo's read-only attack
calls are contained 20/23, and containment is exactly as good as the declarations behind it.

## Benchmarks — real numbers, reproducible by anyone

We don't ask you to trust a vendor claim. Every number below has a public, licensed dataset or a
committed fixture, and a script in this repo that reproduces it:

```bash
uv run python benchmarks/containment/run_containment_benchmark.py        # what survives a total detector bypass
uv run python benchmarks/agentdojo_e2e/run_agentdojo_e2e.py              # benign utility + attack containment at scale
uv run python benchmarks/action_safety/run_action_safety_benchmark.py    # + agentdojo/payloadbox
uv run python benchmarks/entitlement/run_privacylens_benchmark.py
uv run python benchmarks/agent_security/tier_a_multiturn.py              # + tier_b/c/d — vs. a real llm-guard install
uv run python benchmarks/redteam/run_redteam_benchmark.py
uv run python benchmarks/run_prompt_injection_benchmark.py               # detection: our weakest layer, measured anyway
uv run python benchmarks/run_generalization_benchmark.py
uv run python benchmarks/pii/run_presidio_research_benchmark.py          # + gretel_multilingual/tab
```

**Before quoting any of these, read [how to read our numbers](docs/evidence-standards.md)** — what each
kind of evidence establishes, and the limits that apply first.

**Only results clearing 65% on both precision and recall are headlined below** — a weaker number is
disclosed in the linked methodology doc, never omitted or rounded up.

- **Containment when detection fails** — see the table above. This is the number we lead with, because it
  is the one that still holds on the day the model is successfully fooled.
- **Destructive-action / blast-radius analysis**: **100% accuracy, precision and recall** on
  `gretelai/synthetic_text_to_sql`'s held-out split (real + adversarial unbounded/tautology DML/DDL),
  ground-truthed against an independent SQL parser. The generic scope backstop (catches SQLi fragments and
  wildcard values in *unnamed* arguments) scores **89.3% recall / 100% precision** against payload-box's
  SQLi payload list after two rounds of directed fixes — recall started at 36.1%, and the benign-control
  false-positive rate started at 17.6% before the same two rounds.
- **Entitlement / purpose-limitation enforcement**: **100% recall / 0% false positives** across 493 real
  [PrivacyLens](https://github.com/SALT-NLP/PrivacyLens) over-sharing scenarios — a mechanically-constructed
  test on real scenario content, not a labeled-dataset score; see the linked methodology for exactly what
  that does and doesn't establish.
- **Agent-runtime security, four tiers vs. a real, independently-installed `llm-guard`**: multi-turn payload
  splitting (2/2 vs. llm-guard's false triggers on isolated fragments), indirect injection via tool output
  (100% recall / 66.7% precision vs. llm-guard's 90%/81.8%), tool-parameter exploitation and privilege
  escalation (10/10 and 6/6 — axes llm-guard structurally cannot participate in, since it scans text, not
  tool-call structure or capability grants).
- **Automated red-teaming** — built-in adversarial probes (OWASP LLM Top 10 / MITRE ATLAS mapped) fired at
  every real seed agent's actual capability grants and policy bindings, `enforce` mode: **100% recall /
  100% precision** on two of three agents, 95% precision on the third for a disclosed, non-bug reason (a
  stricter EU AI Act Art. 14 policy correctly requiring human sign-off regardless of provenance). This is
  configuration regression testing — it tells you whether *this deployment* got weaker, and it is not a
  robustness certificate.
- **Prompt-injection detection — our weakest layer, measured and published anyway.** Held-out split of
  `deepset/prompt-injections`: **0% → 66.7% recall, 100% precision held throughout**, across four rounds of
  measured, disclosed changes, including a two-model ensemble we tuned ourselves. Across four
  further independent datasets (5,345 examples) the detectors were never tuned against, the **opt-in
  classifier ensemble** reaches 85.6% and 98.6% recall on two of them through the real pipeline and its
  timeouts (re-measured 2026-09-16). It is **not the shipped default**: the default stack scores far lower on
  those same two datasets, and on long prompts the ensemble mostly times out. Treat all of this as a speed
  bump that raises attacker cost, not as a defence — which is why the containment numbers above are the ones
  we lead with.
- **PII detection**, real ECHR case law (127 judgments,
  [TAB dataset](https://github.com/NorskRegnesentral/text-anonymization-benchmark)): **83.6% precision /
  86.9% recall** at full detector policy. A synthetic short-sentence dataset reaches **65.2%/75.6%** at the
  same policy. (The *shipped default* policy trades recall on noisy categories for precision and doesn't
  clear this bar by design — full numbers, not filtered, in the linked methodology.)

Full methodology and every round: **[the benchmarking white paper](docs/benchmarking-whitepaper.md)**. Raw
methodology: [benchmarks/containment/README.md](benchmarks/containment/README.md),
[benchmarks/agentdojo_e2e/README.md](benchmarks/agentdojo_e2e/README.md),
[benchmarks/REPORT.md](benchmarks/REPORT.md),
[benchmarks/agent_security/README.md](benchmarks/agent_security/README.md),
[benchmarks/action_safety/README.md](benchmarks/action_safety/README.md),
[benchmarks/pii/README.md](benchmarks/pii/README.md),
[benchmarks/entitlement/README.md](benchmarks/entitlement/README.md),
[benchmarks/redteam/README.md](benchmarks/redteam/README.md), or the full index at
[benchmarks/README.md](benchmarks/README.md).

## Quick start (development)

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

If you're touching `src/nometria/`, install the pre-commit hook once so the wheels
vendored into `api/` and `demo/redteam-live-lang/` can't silently drift from source
(the failure mode behind two real production incidents):

```bash
uvx pre-commit install
```

CI (`.github/workflows/ci.yml`) runs the backend and dashboard test suites, a
Docker build smoke test, and the same wheel-freshness check as a backstop for a
commit made with `--no-verify`.

## What the demo shows

`nometria demo` walks the request path in [docs/PRD.md §7.3](docs/PRD.md#73-request-path) and prints each step:

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
nometria quickscan                # zero-config first look — see "Try it" above
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

## Agent harness — drive the whole product from Claude Code or any coding agent

[`harness/`](harness/) packages this product as skills, slash commands, subagents, an MCP
server and safety hooks, so "get my support agent governed" or "get me ready for the audit"
works without learning every command first. Install it as a Claude Code plugin:

```bash
claude plugin marketplace add architsharm/guardrails
claude plugin install nometria@nometria
```

Other agents (Codex, Cursor, Gemini CLI) can read [`harness/AGENTS.md`](harness/AGENTS.md).
Anything that would start blocking traffic or stop an agent asks for confirmation first.
How the harness keeps its markdown in sync with the code: [`harness/STRUCTURE.md`](harness/STRUCTURE.md).

**Why this matters more than it sounds.** The standard advice for agent security is "hire someone who
understands this deeply". That does not scale to twenty product teams, and most organisations will never hire
that person. The harness is that expertise encoded: the order of operations, the safety gates, the questions
worth asking, and the evidence to collect — available to whoever is actually shipping the agent. It also runs
an MCP server, so any MCP client gets the same read-only analysis tools.

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
| **[PRD ★](docs/PRD.md)** | **Start here.** The single canonical PRD — argument, product, plan, and what's shipped since |
| [HLD](docs/hld.md) | High-level design — architecture, pillars, integration surfaces, request path, tech stack |
| [LLD](docs/lld.md) | Low-level design — module inventory, key classes/methods, data model, API surface, deployment detail |
| [Production readiness review](docs/production-readiness-review.md) | Gaps found re-checking the HLD/LLD against live code, 2026-09-04 — complements, doesn't replace, gap-analysis.md |
| [Competitor analysis](docs/competitor-analysis.md) | Market landscape, our niche, what to highlight, where competitors win |
| **[Implementation status](docs/status.md)** | **Computed coverage — regenerate with `python scripts/coverage.py --write`** |
| **[Benchmarking white paper](docs/benchmarking-whitepaper.md)** | The product, capability by capability — what it does, how we know it works, and how it differs from the market |
| **[Failure-mode analysis](docs/failure-modes.md)** | **How deployed agents actually fail** — 57 modes in 8 families plus 5 found by an independent audit, grounded in 10k+ catalogued incidents; 54 of 57 covered outright, 2 partial ([computed](docs/status.md)) |
| [Gap analysis](docs/gap-analysis.md) | Enterprise readiness & competitive position — audited, severity-ranked, re-verified 2026-08-29 |
| **[Responding to the critique](docs/responding-to-the-critique.md)** | **What the strongest public criticism of this category gets right, what it gets wrong, and what we changed because of it** |
| [Appendix A](docs/appendix-a-oss-register.md) | OSS dependency register — licence, health, verdict, our exposure |
| [Appendix B](docs/appendix-b-control-catalog.md) | 43 controls mapped to EU AI Act, NIST AI RMF, ISO 42001, SOC 2, OWASP LLM & Agentic, MITRE ATLAS |
| [Appendix C](docs/appendix-c-api-spec.md) | API specification |
| [Appendix D](docs/appendix-d-data-model.md) | Data model |
| [Appendix E](docs/appendix-e-threat-model.md) | Threat model — threats to the customer's agents, and to us |
| [Traceability](docs/traceability.md) | Every requirement → the module that implements it |
| [Agent harness](harness/README.md) | Skills, commands, subagents, MCP server and safety hooks for driving the product from a coding agent |
| [docs/research/](docs/research/) | Raw research inputs (practitioner CVs, market analysis) the PRD synthesizes — not living documentation, kept for provenance |

## Honest limits

- **Compliance mappings are DRAFT.** Produced from framework texts by engineers, not reviewed by compliance counsel. The product badges them as such: draft mappings ship in evidence packages chip-labeled `DRAFT — UNVERIFIED / NOT LEGAL ADVICE` rather than being excluded. See [Appendix B §B.6](docs/appendix-b-control-catalog.md#b6-mapping-review-gate).
- **Coverage gaps are declared, not hidden.** Appendix B §B.4 lists what each framework mapping does *not* cover; Appendix E §E.3 does the same for threats.
- **This is an MVP.** Single-org multi-tenancy enforced at the session (not yet a managed multi-region offering), no live IdP/SSO, no scheduled red-team campaigns, text modalities only. Full non-goals list: [docs/PRD.md §10.3](docs/PRD.md#103-non-goals).

## Licence

Apache-2.0. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
