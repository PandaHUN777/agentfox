# Nometria

Nometria is a control plane that sits between your AI agent and the models, tools and data it
reaches, and decides what each call is allowed to do. Every decision is recorded in a
tamper-evident log and mapped to the compliance frameworks you have to answer to.

**What makes it different: it does not depend on catching the attack.** Most agent-security tools
are detectors. A detector that misses is a detector that lets the action through. Nometria's
primary layer is underneath detection: each tool is declared with an impact tier, each agent holds
explicit capability grants with argument limits, and every argument carries the provenance of where
it came from. A transfer whose recipient originated in a retrieved document is refused because of
where the value came from, not because anything recognised the payload. We measure that separately,
with every detector switched off, and publish the result below.

## See it work right now

**1. Hosted playground, no account, nothing to install:**
<https://guardrails-dashboard-eight.vercel.app/playground>

Every visitor gets a throwaway sandbox running the same enforcement code the product runs in
production. Send an injection and watch the baseline policy flag it while the call still goes
through, because the sandbox starts in observe mode. Flip the same sandbox to enforce and watch the
identical call blocked. A tamper-evident audit chain on the page records every decision and reports
its own verification state as you go.

**2. Locally, two commands after install:**

```bash
pip install git+https://github.com/architsharm/guardrails.git
nometria init && nometria demo
```

`init` creates a SQLite database, loads 43 controls and three policy packs, and finishes in about a
second. `demo` runs a thirteen-step walkthrough and finishes in about five. Both are offline: no
API key, no downloaded weights, no network egress. The `echo` model provider makes the whole
enforcement path demonstrable with nothing installed.

**3. Point it at your own code, without installing anything permanently:**

```bash
curl -fsSL https://raw.githubusercontent.com/architsharm/guardrails/main/scripts/quickscan.sh | bash
```

No account, no clone, no config. It installs into a throwaway virtualenv (removed on exit), scans
the current directory for agent code, checks what is actually running via local AI-tool session
transcripts, and runs a handful of known-adversarial prompts through the real detector pipeline
right in your terminal, so "we catch prompt injection" is something you watch happen rather than
something we said. Nothing talks to anything but PyPI and GitHub, to fetch the package, and your
local filesystem.

New here? [docs/getting-started.md](docs/getting-started.md) is a linear first hour that ends with
your own agent governed.

## What the demo actually prints

Real output from `nometria init && nometria demo`, trimmed. The convincing part is step 3, and it
arrives about six seconds in.

**Step 2. An injection arrives inside a retrieved document, not in the user's message.** The
baseline policy ships in observe mode, so the call is not blocked. The platform records what it
would have done instead.

```
  retrieved document  enforced=allow  policy-would=block  5.1ms
      injection.indirect → block  baseline is in observe
        Instruction-like content found in untrusted retrieved or tool content
        controls: NOM-RTG-01, NOM-DSC-05
      detected: INJECTION.COVERT_INSTRUCTION, INJECTION.INSTRUCTION_OVERRIDE
```

That default is deliberate. A library that starts refusing production traffic because someone added
an import gets switched off within a day.

**Step 3. The injection has already succeeded, and the transfer is refused anyway.** Assume
detection failed and the model was fully persuaded. The account number still came from an untrusted
document, and an irreversible tool may not take untrusted arguments:

```
  transfer, argument from the user  enforced=allow  policy-would=escalate  9.5ms
      eu.art14.human_oversight → escalate  eu-ai-act-high-risk is in observe

  transfer, recipient from the poisoned document  enforced=escalate  policy-would=escalate  3.9ms
      taint.irreversible_tool → escalate  tool-containment is in enforce
        Irreversible tool invoked with arguments originating in untrusted content
        controls: NOM-RTG-04, NOM-IAM-03
      capability.approval_required → escalate  tool-containment is in enforce
        The granting capability requires human approval for this action.
  → suspended pending human approval (apr_01m376v9x66a0k5yn4)

  transfer above the capability's argument constraint  enforced=block  policy-would=block  3.6ms
      capability.denied → block  tool-containment is in enforce
        No capability grants this agent the requested tool and action (default deny).
        controls: NOM-IAM-02
```

Three calls, three different outcomes, and none of them decided by a detector. The first is clean
and goes through. The second is identical except that one argument came out of the poisoned
document, so it stops for a human. The third exceeds the argument limit written into the
capability, so it is refused outright. Note which policy pack is in enforce mode: `tool-containment`
blocks from the moment you run `init`, while the detector-driven `baseline` pack does not.

**Step 8. Enforcement on.** The demo promotes the baseline policy and replays the same injection
from step 2:

```
  baseline policy promoted from observe → enforce
  the same injection, now enforced  enforced=block  policy-would=block  4.3ms
      injection.indirect → block  baseline is in enforce
```

**Step 10. The audit chain notices when history is edited.** The demo verifies the chain, alters an
entry directly in the database, then verifies again:

```
  chain: 25 entries, head seq 25
  verification: INTACT  (25 entries checked)
  after editing entry 3 directly in the database: TAMPERED
      seq 3 · payload_mismatch — payload does not match its recorded digest
```

The other nine steps cover a shadow agent discovered from gateway traffic, graded PII redaction, an
eval suite catching a fluent and wrong answer, a red-team campaign against the deployed
configuration, the execution path for one trace, compliance status computed from telemetry rather
than attested, and an auditor evidence package that ships with a stdlib-only `verify_chain.py` so
the auditor does not have to trust us. The demo restores the baseline policy to observe when it
finishes.

## What we claim, and what we don't

**We do not claim adversarial robustness, and we don't believe anyone can.** [*The Attacker Moves
Second*](https://arxiv.org/abs/2510.09023) (Nasr, Carlini, Schulhoff et al., 2025) reports over 90%
attack success against twelve published defences once the attacker is allowed to adapt. Our
detectors are no exception, and we measure it against ourselves: an
[adaptive search-based attacker](benchmarks/adaptive/README.md) that reads our verdict and tries
again gets **73% of the attacks we catch through within 50 attempts**, using only mutations a model
can still read. Our held-out injection recall is **66.7%**, published in full rather than rounded
up, along with the over-defense cost it carries. Building that benchmark found three real bugs in
our own detectors, now fixed: benign false positives on the standard over-defense set fell from
8.6% to 0.3%, and it turned out some prior "detections" were nothing but curly apostrophes.

**What we do claim is that the blast radius is bounded when detection fails.** That claim is
measured two ways, both with every detector switched off, which is a total bypass rather than a
simulated miss:

| Evidence | Result |
|---|---|
| [Containment under total detector bypass](benchmarks/containment/README.md) | **8/8 attacks contained with zero detector signal**; 4/4 legitimate calls still allowed |
| [AgentDojo replayed end to end](benchmarks/agentdojo_e2e/README.md), 617 ground-truth calls | **42/42 attacker calls that act, contained**; **552/552 legitimate calls allowed**; identical with detectors disabled |

In both, detection contributed nothing. Capability grants, argument provenance and declared impact
tiers did the work, which is the whole design. Read the honest limits in each: AgentDojo's
read-only attack calls are contained 20/23, and containment is exactly as good as the declarations
behind it.

### Where a competitor beats us

Prompt-injection detection is our weakest layer, and we publish it rather than omit it. On the
held-out split of `deepset/prompt-injections` we went **0% → 66.7% recall, 100% precision held
throughout**, across four rounds of measured, disclosed changes including a two-model ensemble we
tuned ourselves. Across four further independent datasets (5,345 examples) the detectors were never
tuned against, the opt-in classifier ensemble reaches 85.6% and 98.6% recall on two of them through
the real pipeline and its timeouts (re-measured 2026-09-16). It is **not the shipped default**: the
default stack scores far lower on those same two datasets, and on long prompts the ensemble mostly
times out.

Measured against a real, independently installed `llm-guard`, we lose on one axis outright:
indirect injection via tool output, where we score 100% recall / 66.7% precision against
llm-guard's 90% / 81.8%. We win on multi-turn payload splitting (2/2, where llm-guard false-triggers
on isolated fragments) and on tool-parameter exploitation and privilege escalation (10/10 and 6/6),
but those are axes llm-guard structurally cannot participate in, since it scans text rather than
tool-call structure or capability grants. Treat all detection numbers as a speed bump that raises
attacker cost, not as a defence. That is why the containment numbers above are the ones we lead
with.

### Other honest limits

- **Compliance mappings are DRAFT.** Produced from framework texts by engineers, not reviewed by
  compliance counsel. The product badges them as such: draft mappings ship in evidence packages
  chip-labeled `DRAFT — UNVERIFIED / NOT LEGAL ADVICE` rather than being excluded. See
  [Appendix B §B.6](docs/appendix-b-control-catalog.md#b6-mapping-review-gate).
- **Coverage gaps are declared, not hidden.** Appendix B §B.4 lists what each framework mapping
  does *not* cover; Appendix E §E.3 does the same for threats.
- **This is an MVP.** Single-org multi-tenancy enforced at the session (not yet a managed
  multi-region offering), no live IdP/SSO, text modalities only. Full non-goals list:
  [docs/PRD.md §10.3](docs/PRD.md#103-non-goals).
- **Scheduled red-teaming is off by default.** A weekly adaptive posture campaign
  (`redteam.posture` in `scheduler.py`, run by `job_handlers.py`) ships as a default schedule but is
  created disabled, so a tenant opts in per deployment. It reports a posture delta against the last
  comparable campaign, not a pass rate, and it is configuration regression testing rather than a
  robustness certificate.
- **Containment is exactly as good as your declarations.** If a destructive tool is declared
  `read`, nothing downstream will treat it as destructive. `nometria doctor` grades this, and
  `nometria check` finds the tools you have not declared yet.

> **Status: MVP v0.3.** Live coverage, computed by probe rather than asserted:
> **[docs/status.md](docs/status.md)**.

## Benchmarks, reproducible by anyone

Every number above has a public, licensed dataset or a committed fixture, and a script in this repo
that reproduces it:

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

**Before quoting any of these, read [how to read our numbers](docs/evidence-standards.md)**, which
sets out what each kind of evidence establishes and the limits that apply first. Only results
clearing 65% on both precision and recall are headlined; a weaker number is disclosed in the linked
methodology doc, never omitted or rounded up. Every headline number in this README is bound to its
result file and checked in CI by `scripts/claims.py`, so it cannot drift silently.

Four more results worth knowing:

- **Destructive-action / blast-radius analysis**: **100% accuracy, precision and recall** on
  `gretelai/synthetic_text_to_sql`'s held-out split (real + adversarial unbounded/tautology
  DML/DDL), ground-truthed against an independent SQL parser. The generic scope backstop (catches
  SQLi fragments and wildcard values in *unnamed* arguments) scores **89.3% recall / 100%
  precision** against payload-box's SQLi payload list after two rounds of directed fixes. Recall
  started at 36.1%, and the benign-control false-positive rate started at 17.6% before the same two
  rounds.
- **Entitlement / purpose-limitation enforcement**: **100% recall / 0% false positives** across 493
  real [PrivacyLens](https://github.com/SALT-NLP/PrivacyLens) over-sharing scenarios. This is a
  mechanically-constructed test on real scenario content, not a labeled-dataset score; see the
  linked methodology for exactly what that does and doesn't establish.
- **PII detection** on real ECHR case law (127 judgments,
  [TAB dataset](https://github.com/NorskRegnesentral/text-anonymization-benchmark)): **83.6%
  precision / 86.9% recall** at full detector policy. A synthetic short-sentence dataset reaches
  **65.2%/75.6%** at the same policy. The *shipped default* policy trades recall on noisy categories
  for precision and doesn't clear this bar by design; full numbers, not filtered, are in the linked
  methodology.
- **Automated red-teaming**: built-in adversarial probes (OWASP LLM Top 10 / MITRE ATLAS mapped)
  fired at every real seed agent's actual capability grants and policy bindings, in `enforce` mode:
  **100% recall / 100% precision** on two of three agents, 95% precision on the third for a
  disclosed, non-bug reason (a stricter EU AI Act Art. 14 policy correctly requiring human sign-off
  regardless of provenance). This is configuration regression testing. It tells you whether *this
  deployment* got weaker, and it is not a robustness certificate.

Full methodology and every round: **[the benchmarking white paper](docs/benchmarking-whitepaper.md)**.
Raw methodology per benchmark: [containment](benchmarks/containment/README.md),
[agentdojo_e2e](benchmarks/agentdojo_e2e/README.md), [adaptive](benchmarks/adaptive/README.md),
[agent_security](benchmarks/agent_security/README.md),
[action_safety](benchmarks/action_safety/README.md), [pii](benchmarks/pii/README.md),
[entitlement](benchmarks/entitlement/README.md), [redteam](benchmarks/redteam/README.md),
[the roll-up report](benchmarks/REPORT.md), or the full index at
[benchmarks/README.md](benchmarks/README.md).

## Put it in front of your own agent

### Python, one line

```python
import nometria
nometria.auto()
```

Every model call in the process (OpenAI, Anthropic, LiteLLM or LangChain, sync or async, streamed
or not) is now traced, evaluated against policy and written to the audit log. Nothing else in your
codebase changes, and no model call is blocked: `auto()` follows each policy's own mode, and the
`baseline` policy that governs model traffic starts in observe. `auto(mode="observe")` pins a
process to never raising.

### Any language, over HTTP

Start the control plane, then call it. No Python in your application required.

```bash
nometria serve                      # gateway + control-plane API on 127.0.0.1:8080
nometria auth issue you@example.com # mint an API token; shown once
```

Point an existing OpenAI or Anthropic client at `http://localhost:8080/v1` and keep your code as it
is, or ask about one tool call directly:

```bash
curl -s -X POST http://localhost:8080/v1/guard/tool_call \
  -H "Authorization: Bearer $NOMETRIA_TOKEN" -H "Content-Type: application/json" \
  -d '{"agent":"payments-ops","tool":"payments.transfer",
       "arguments":{"amount":250,"currency":"USD","to":"acct_991"},
       "provenance":{"to":"tool_result","amount":"user"},
       "intent":"refund a duplicate charge"}' | jq '{verdict, approval_id}'
```

```json
{ "verdict": "escalate", "approval_id": "apr_01m376q43zby33tbsp" }
```

Flip `"to"` to `"user"` and the same call returns `allow`. Full surface:
[Appendix C](docs/appendix-c-api-spec.md).

### LangGraph

```python
from nometria.integrations.langgraph import NometriaGuard

guard = NometriaGuard(agent="support-triage", intent="answer a refund question")

builder.add_node("retrieve", guard.retrieval_node(fetch_docs))     # indirect injection blocked
builder.add_node("model",    guard.model_node(call_model))          # in + out enforced, traced
builder.add_node("pay",      guard.tool_node(transfer, tool="payments.transfer"))
```

Trace identity lives in graph state so it survives checkpointing and resumption. Escalation maps to
LangGraph's own `interrupt()`, so there is one pause mechanism rather than two.

### Turning enforcement on

`nometria policy enforce baseline` is the one step that starts blocking model traffic, and `auto()`
picks it up with no code change. Everything before it is safe to run. Demote again with
`nometria policy observe baseline`.

## Commands

Grouped by what you are trying to do. Every command below was run to verify it works.

**Find out what you already have**

```bash
nometria quickscan                     # zero-config first look, nothing leaves this machine
nometria check                         # scan a repo: what talks to a model, and what is ungoverned
nometria agents list                   # every agent, registered or shadow, and who owns it
nometria agents discover               # sweep for shadow agents, drift and identity posture
nometria agents lineage payments-ops   # what one agent reaches: its blast radius
nometria scan mcp internal-tools --seed-fixture   # MCP tool hygiene; --file takes a real tools/list
```

**Bound what an agent is allowed to do**

```bash
nometria tools declare billing.export --impact write   # none | read | write | irreversible
nometria capability grant support-triage tickets.close \
    --limit priority:in=low,normal --max-taint user
nometria capability list support-triage                # anything not listed is refused
nometria capability revoke <capability-id>
```

`--max-taint` is the worst provenance an argument may carry and still go through without an
approval: one of `none`, `user`, `retrieved`, `tool_result`, `subagent`, `memory`. `capability
grant` is the only command that widens least privilege, so it confirms before it writes and records
the result in the audit chain. `--yes` skips the prompt in CI.

**See what happened**

```bash
nometria findings                      # what the platform found; --severity high to narrow
nometria doctor                        # is the runtime configured the way you think it is?
nometria audit verify                  # re-derive the chain; exits 1 if broken
nometria evidence export --agent support-triage --from 2026-08-01 --to 2026-09-30
```

`evidence export` accepts `--from`/`--to` as `YYYY-MM-DD` or full ISO-8601, and falls back to
`--since-days` (default 30) when neither is given.

**Test before you trust**

```bash
nometria eval run support-quality                   # score a suite
nometria eval gate support-quality                  # CI regression gate; exits 1 on regression
nometria redteam run support-triage                 # probe the deployed configuration
nometria redteam probes                             # what the built-in suite contains
nometria policy lint                                # exits 1 on critical or high findings
nometria policy simulate --file candidate.yaml      # replay recorded traffic against a candidate
```

`eval gate` compares against the suite's latest recorded baseline; pass `--baseline <run-id>` to
pin a specific run.

**Run it**

```bash
nometria serve                         # gateway + control-plane API
nometria auth issue you@example.com    # mint an API token
nometria auth status                   # how this deployment authenticates
nometria db upgrade                    # apply migrations
nometria policy effective --agent support-triage    # what is in force, and where each rule came from
nometria compliance status --framework eu-ai-act
nometria agents quarantine support-triage --reason "investigating"   # kill switch, reversible
nometria agents resume support-triage
```

## Drive it from a coding agent

[`harness/`](harness/) packages this product as skills, slash commands, subagents, an MCP server
and safety hooks, so "get my support agent governed" or "get me ready for the audit" works without
learning every command first. Install it as a Claude Code plugin:

```bash
claude plugin marketplace add architsharm/guardrails
claude plugin install nometria@nometria
```

From a clone, point the marketplace at the checkout instead: `claude plugin marketplace add .`
Other agents (Codex, Cursor, Gemini CLI) can read [`harness/AGENTS.md`](harness/AGENTS.md).
Anything that would start blocking traffic or stop an agent asks for confirmation first. How the
harness keeps its markdown in sync with the code: [`harness/STRUCTURE.md`](harness/STRUCTURE.md).

The standard advice for agent security is "hire someone who understands this deeply". That does not
scale to twenty product teams, and most organisations will never hire that person. The harness is
that expertise encoded: the order of operations, the safety gates, the questions worth asking, and
the evidence to collect, available to whoever is actually shipping the agent. It also runs an MCP
server, so any MCP client gets the same read-only analysis tools.

## Development

```bash
python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
nometria seed && nometria demo         # a demonstrable environment, then the walkthrough
```

Add real capability as configuration:

```bash
pip install -e ".[all]"      # Presidio, Granite Guardian, Garak, PyRIT, OTel, Postgres
```

Or bring up the full stack (gateway, OPA sidecar, Postgres, dashboard):

```bash
docker compose -f deploy/docker-compose.yml up
```

If you're touching `src/nometria/`, install the pre-commit hook once so the wheels vendored into
`api/` and `demo/redteam-live-lang/` can't silently drift from source (the failure mode behind two
real production incidents):

```bash
uvx pre-commit install
```

CI (`.github/workflows/ci.yml`) runs the backend and dashboard test suites, a Docker build smoke
test, the published-claims check (`scripts/claims.py --check`), and the same wheel-freshness check
as a backstop for a commit made with `--no-verify`.

## Where this sits in the market

Enterprises deploying agents are stuck between two camps that each own half the problem. GRC
incumbents (Credo AI, OneTrust, ModelOp) own policy, registry and framework mapping but were built
for the *model* era, with no runtime enforcement, no execution paths and no evaluation.
Agent-security tools (Arthur, Zenity, Lakera, Prisma AIRS, Agent 365) own runtime guardrails but are
thin on compliance, and several are locked to one vendor's model, cloud or security suite.

The defensible middle is a vendor-neutral, agent-native control plane that unifies runtime security,
reliability and evaluation, tamper-evident audit and compliance mapping. A model provider cannot
build that without a conflict of interest, a GRC incumbent cannot retrofit it, and a point-security
tool does not attempt it. Full reasoning, evidence and roadmap: **[docs/PRD.md](docs/PRD.md)**.
Market landscape and where competitors win: [docs/competitor-analysis.md](docs/competitor-analysis.md).

### The six pillars

| # | Pillar | Answers | Built on |
|---|---|---|---|
| 1 | Discovery & Agent Registry | *What agents do we have?* | ours |
| 2 | Identity, Access & Authorization | *What is it allowed to touch?* | **OPA/Rego** + ours |
| 3 | Runtime Guardrails & Security | *Stop the bad thing* | **Presidio**, **Granite Guardian**, **NeMo/Guardrails AI** + ours |
| 4 | Evaluation & Reliability | *Does it actually work?* | **promptfoo**, **Garak**, **PyRIT** + ours |
| 5 | Audit & Traceability | *Show me what happened* | **OpenTelemetry** + ours |
| 6 | Policy & Compliance | *Prove we meet the rules* | ours — essentially no OSS exists here |

### What's ours, and what we wrap

This isn't a bundle of open-source scanners with a UI on top. Roughly 20% of the engineering
integrates OSS primitives; 80% is proprietary logic above them.

| | Examples | Status |
|---|---|---|
| **Wrapped OSS primitives** — the raw detection/policy engines | Presidio (PII), Granite Guardian, sqlglot (SQL parsing), OPA/Rego (policy), OpenTelemetry (tracing) | Swappable behind our own adapter interface — see [Appendix A](docs/appendix-a-oss-register.md) |
| **Proprietary, built by us** — the logic that turns a primitive into a governance decision | Argument-provenance taint tracking · deterministic blast-radius/action-semantics analysis on generated SQL · answerability & abstention against a declared knowledge boundary · end-user entitlement propagation through retrieval and tool calls · escalation-failure counterfactual detection · the tamper-evident audit chain and its independent verifier · the PIGuard+backstop ensemble tuning that drives our own injection-detection numbers | None of it exists as an off-the-shelf OSS or commercial primitive today; see [docs/PRD.md §1.4](docs/PRD.md#14-what-is-genuinely-differentiated--and-what-is-not) for what's genuinely unclaimed vs. contested |

**Build-vs-reuse rule:** wrap the primitive, own the interface. Every wrapped project sits behind a
swappable adapter, recorded in [Appendix A](docs/appendix-a-oss-register.md), which also records
*why* LLM Guard (archived), Invariant/mcp-scan (Snyk-owned), Llama Guard (non-OSI licence) and
systemprompt-core (BSL) are deliberately **off** the critical path.

## Documentation

Start at [docs/README.md](docs/README.md), which says what each document is for and who it is for.
The two most useful first reads:

- **[docs/getting-started.md](docs/getting-started.md)**: a linear first hour, from install to
  enforcement on your own agent.
- **[docs/PRD.md](docs/PRD.md)**: the single canonical PRD, covering the argument, the product, the
  plan, and what has shipped since.

## Licence

Apache-2.0. Third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
