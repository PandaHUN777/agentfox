# PRD — Nometria Control Plane

**Agent-native, vendor-neutral governance, security & compliance for AI agents in production.**

| | |
|---|---|
| **Document** | Product Requirements Document, v1.0 |
| **Date** | 2026-08-17 |
| **Status** | Approved for build (MVP v0.1) |
| **Owner** | Product / Founding team, Nometria |
| **Upstream inputs** | `agent-harness-dashboard.html` (market briefing), `agent-governance-roadmap.html` (wedge → roadmap), `oss-guardrails-catalog.html` (build-vs-reuse catalog) |
| **Appendices** | [A — OSS Dependency Register](appendix-a-oss-register.md) · [B — Control Catalog & Framework Mapping](appendix-b-control-catalog.md) · [C — API Specification](appendix-c-api-spec.md) · [D — Data Model](appendix-d-data-model.md) · [E — Threat Model](appendix-e-threat-model.md) |
| **Traceability** | [docs/traceability.md](traceability.md) — every FR in this document mapped to the module that implements it |

---

## 0. How to read this document

Requirements are identified as `P<pillar>-<n>` (functional, by pillar), `NFR-<n>` (non-functional), and `X-<n>` (cross-cutting). Each carries:

- **Tier** — the smallest customer tier for which the requirement is *Critical* (A = mid-market, B = enterprise, C = large/regulated). See §8.
- **Phase** — the roadmap phase it ships in (0/1/2/3). See §14.
- **Source** — `REUSE` (wrapped OSS), `BUILD` (our engineering), or `HYBRID`.
- **MVP** — ✅ in MVP v0.1, ◐ partial in MVP v0.1, ✗ specified but not built in this pass.

MVP v0.1 is a **thin functional slice across all six pillars**, not a Phase-0-only build. Rationale in §6.

---

## 1. Summary

### 1.1 The one-paragraph thesis

Enterprises deploying AI agents need **one place to see every agent, control what it can do, prove it works, and demonstrate compliance — across every model and cloud.** Today that need is split between two camps that each own half of it. Governance/GRC incumbents (Credo AI, OneTrust, Holistic AI, ModelOp, FairNow) own policy, registry, framework mapping and reporting, but were built for the *model* era: they have no runtime enforcement, no understanding of agent execution paths or tool calls, and no evaluation depth. Agent-security tools (Arthur, Zenity, Lakera, Palo Alto Prisma AIRS, Microsoft Agent 365, Astrix) own runtime guardrails, identity and discovery, but are thin on compliance and evaluation, and several are structurally locked to one vendor's model, cloud, or security suite. **Nometria is the defensible middle**: an agent-native, vendor-neutral control plane that unifies runtime security, reliability/evaluation, tamper-evident audit and compliance mapping — the exact product a model provider cannot build without a conflict of interest, a GRC incumbent cannot retrofit, and a point-security tool does not attempt.

### 1.2 Why this wedge (evidence)

From the market briefing (sources: Menlo Ventures *State of Generative AI in the Enterprise 2025*; Bessemer *AI Infrastructure Roadmap 2026*; LangChain *State of Agent Engineering* n=1,340; Cleanlab *AI Agents in Production 2025* n=1,837; OpenAI AgentKit announcement):

| Signal | Figure | Implication for us |
|---|---|---|
| Enterprise gen-AI spend 2025 | $37B, ↑3.2× YoY | Large, compounding pool |
| Spend on *dedicated agents* | ~$750M (vs $7.2B copilots) | Thin today — we are early, not late |
| Deployments that are *true agents* | 16% enterprise / 27% startup | Most "agents" are workflows; the real agent population is small but growing |
| Production-live (strict screen) | 5.2% (Cleanlab) vs 57% (LangChain builders) | **The spread between these two numbers is the reliability/trust gap we sell into** |
| #1 barrier to production | Quality/reliability, 32% | Reliability is the growing pain |
| #2 barrier at 2,000+ employees | Security, 24.9% | Security is enterprise-gating |
| Cost as a barrier | **Declining** YoY | Do not build a "spend less on tokens" product — that pain is shrinking |
| Teams with observability | 89–94% | Table-stakes; not a differentiator |
| Teams running evals | 52.4% offline / 37.3% online / **22.8% none** | The widest solved-vs-unsolved gap in the stack |
| AI failures that are "invisible" | ~78% (Bessemer citing WildChat study) | Silent-failure detection is an unclaimed category |
| Teams satisfied with tooling | < 1 in 3 | Incumbency is weak |

**Caveat carried forward from the research:** adoption and pain figures come from vendor-run surveys of self-selected agent builders. They are directional, not census-grade — which is exactly why the 5.2%–57% production spread exists. Market-sizing projections (e.g. $10.9B 2026 → $182.9B 2033) diverge sharply by firm and are treated as narrative, not planning input. Menlo's spend data is the defensible anchor. Competitor capability claims come from 2026 buyer guides and shift quickly; re-validate before positioning against a named rival.

### 1.3 Why it is defensible

Three moats, in order of durability:

1. **Neutrality is structural.** A model provider's evaluation or guardrail product that "also supports competitors" is a conflict of interest they will never fully commit to. OpenAI's AgentKit Evals technically supports third-party models — and that support will always be half-hearted, because depth there cannibalises the model business. Neutrality is the one property Microsoft and Palo Alto cannot copy, because they *sell* the lock-in.
2. **Agent-native runtime + evaluation depth cannot be retrofitted by GRC incumbents.** Credo AI and OneTrust model a *model registry*; governing an agent means governing an execution path — prompts, tool calls, sub-agent delegation, retries, and the decision to act. That is a different data model, not a feature.
3. **Unifying all six pillars is what point tools do not attempt.** Lakera does sub-50ms inline guardrails and nothing else; Zenity does intent-based runtime and posture. Neither ties enforcement to evaluation, to immutable audit, to framework mapping. The unification *is* the product.

**The one rule** (from the market briefing, and binding on every scoping decision in this document): *design around the assumption that model providers keep absorbing the commodity middle. Anything a future AgentKit release could bundle for free is not a business.*

### 1.4 The build-vs-reuse rule

From the OSS catalog: **~20% of engineering on integrating open source, ~80% on the build column.** Concretely:

> If a permissively-licensed (Apache/MIT), actively-maintained OSS project already does a primitive well, **wrap it — do not rebuild it.** Our product is the integration, the evaluation depth, the compliance mapping, and the neutrality — none of which any single OSS project provides.

This rule is enforced architecturally: every runtime primitive sits behind a `Detector`/`Adapter` interface (§9.4) so that the OSS implementation is swappable and the *policy interface above it* is ours. See Appendix A for the full register and §12 for the decisions.

---

## 2. Problem statement

### 2.1 The user's problem, in their words

**Platform engineer (Tier A/B):** "We shipped an agent that can file tickets and email customers. I have traces in Langfuse, but I cannot tell you whether last Tuesday's output was *correct*, I cannot prove the agent never saw a customer's SSN, and I have no idea how many agents other teams have spun up on our OpenAI org key."

**CISO (Tier B/C):** "I have three vendors' agents, two clouds, and four models in production. I have no inventory. My SIEM sees API calls, not agent intent. When the regulator asks what this agent was allowed to do on 3 March and what it actually did, I have nothing that survives an audit."

**Head of GRC (Tier C):** "We need to map our AI controls to the EU AI Act, NIST AI RMF and ISO 42001 once, and satisfy all three. Today that is a spreadsheet maintained by hand, refreshed quarterly, and out of date the day it is filed."

### 2.2 The four questions the product answers

Every requirement in this document exists to answer one of four questions an enterprise asks about any agent:

| Question | Pillars |
|---|---|
| **What is it?** | 1 — Discovery & Agent Registry |
| **What can it do?** | 2 — Identity, Access & Authorization · 3 — Runtime Guardrails & Security |
| **Does it work?** | 4 — Evaluation & Reliability Assurance |
| **Can we prove it?** | 5 — Audit, Observability & Traceability · 6 — Policy & Compliance Management |

### 2.3 What is already solved (explicit non-goals)

Per the market briefing's "solved — don't build here" list, we do **not** build, and will not compete on:

- **The agent loop / orchestration.** LangGraph, CrewAI, AutoGen, LlamaIndex, Temporal, Inngest. Free and abundant. We *integrate with* them; we never ask a customer to re-architect onto our framework.
- **Tool connectivity.** MCP standardised this in ~18 months and is Anthropic-authored and open. We consume MCP; we do not build a competing connectivity layer or an MCP hub business.
- **Tracing plumbing.** 89–94% of teams already have it and it is consolidating into incumbents (Langfuse → ClickHouse). We emit and ingest OpenTelemetry; we do not sell a tracing product.
- **Model routing / gateways.** LiteLLM has 418M monthly downloads on ~$15M raised — the cautionary tale that ubiquity ≠ revenue. We can sit inline, but "routing" is not a feature we monetise.
- **Retrieval mechanics / vector DBs.** Commoditised. The bottleneck moved to retrieval *quality*, which we address in Pillar 4 (groundedness scoring), not in storage.
- **Runtime sandboxing.** E2B, Modal, Daytona. Genuine technical moat, narrow, capital-intensive, entrenched, hard to enter late. We *govern* sandboxed execution; we do not build isolation tech.

---

## 3. Positioning & competition

### 3.1 The two-axis frame

The competitive field is decided by **agent-native runtime depth** (does it understand execution paths, tool calls, and correctness?) versus **compliance depth** (policy, frameworks, audit, evidence). The incumbents cluster in two corners. The top-right — deep on both, and neutral — is open.

| Competitor | Camp | Strength | Structural weakness we exploit |
|---|---|---|---|
| **Lakera** | Agent security | Runtime guardrails, sub-50ms inline | Light on compliance/GRC. A *feature we must match*, not a full-platform rival. |
| **Zenity, Arthur** | Agent security | Intent-based detection over the full execution path incl. tool calls; posture | Thin on evaluation depth and compliance. **Closest rivals** — beat them on eval + compliance + neutrality. |
| **Palo Alto (Prisma AIRS), Microsoft (Agent 365)** | Agent security | Deep pockets, distribution, bundled | Locked to their security suite / cloud / identity stack. **Neutrality is the wedge.** |
| **Credo AI, OneTrust** | GRC | Registry, policy, framework mapping, reporting | Model-era; weak on runtime, agents, evaluation. Out-flank on agent-native depth. |
| **Holistic AI, ModelOp, FairNow** | GRC | Compliance & lifecycle depth | Minimal runtime enforcement. Same flank. |
| **OpenAI AgentKit, Anthropic Claude Agent SDK, Google ADK** | Provider | Free, bundled, distribution | Conflict of interest on neutrality; not a compliance/audit product; not their DNA. |

### 3.2 Our sentence

> **Nometria is the vendor-neutral control plane for AI agents in production: see every agent, control what it can do, prove it works, and demonstrate compliance — across every model, framework and cloud.**

### 3.3 The principal risk

A well-funded agent-security player (Arthur, Zenity) adds compliance faster than we add runtime depth. **Mitigation, and it is a product mitigation, not a marketing one:** keep the runtime + evaluation lead while racing them to the compliance pillar. This is why MVP v0.1 is a thin slice across all six rather than a deep Phase 0 (§6.2) — the compliance pillar must exist, however thinly, from day one so it can compound.

---

## 4. Users, buyers & personas

### 4.1 Personas

| Persona | Role in product | Primary jobs | Tier |
|---|---|---|---|
| **Priya — Platform / AI engineer** | Champion & daily user | Instrument agents, define policies, fix eval regressions, respond to blocked calls | A, B |
| **Marcus — CISO / Head of Security** | Economic buyer (B/C) | Inventory all agents, prove least-privilege, review incidents, feed SIEM, report to board | B, C |
| **Dana — GRC / Compliance lead** | Economic buyer (C) | Map controls to frameworks, maintain risk register, produce audit evidence, track obligations | C |
| **Aisha — Internal / external auditor** | Read-only consumer | Verify audit-log integrity, pull evidence for a period, confirm control operation | C |
| **Tom — Agent owner (business)** | Accountable party | Own an agent's business purpose and risk tier; approve HITL escalations | B, C |

### 4.2 RBAC roles (implements the personas)

`owner` · `admin` · `security` · `compliance` · `developer` · `auditor` (read-only, cannot mutate audit state) · `agent` (machine identity, gateway-only).

Full permission matrix in Appendix C §4.

### 4.3 GTM motion the product must support

| Tier | Economic buyer | Champion | Lead with | Motion | ACV | Product implication |
|---|---|---|---|---|---|---|
| **A** — Mid-market / AI-native (~500–2,000 emp) | Head of Eng / Platform | Senior engineers | Safety + eval + SOC 2 to sell upmarket | PLG / self-serve, bottoms-up | $ low | **Must install in <10 minutes with no procurement.** Free tier, single binary/compose, no SSO required. |
| **B** — Enterprise (~2,000–10,000) | CISO + Head of AI Platform | Platform & security eng | Control plane: see + control + audit all agents | Sales-assisted, design partners, security review | $$ mid | **Must pass a security review**: SSO/SCIM, RBAC, audit log, SIEM export, self-host option. |
| **C** — Large / regulated (10,000+, finance/health/gov) | CISO + Chief Compliance/GRC | GRC, DPO, risk, audit | Provable compliance, residency, board risk | Enterprise sales, POC, procurement, MSA | $$$ high | **Must survive an audit**: tamper-evident evidence, residency/air-gap, framework mapping, risk register, board reporting. |

**Land-and-expand:** enter bottoms-up through the platform/security engineer who feels the runtime pain (Phase 0), prove value on a real blocked incident, expand to the CISO as the control plane (Phase 1), then to GRC as the audit and framework story matures (Phase 2). Each buyer unlocks the next tier's budget.

---

## 5. Product principles

1. **Drop-in, never re-architect.** Any integration that requires rewriting the agent is a failed integration. Three surfaces, all optional-additive: inline gateway (zero code change), SDK (one decorator), OTel ingestion (passive). — *X-1*
2. **Neutral by construction.** No feature may depend on a single model provider, cloud, framework, or security suite. Every provider is an adapter. If a capability can only work on one vendor, it does not ship in core. — *X-2*
3. **Wrap the primitive, own the interface.** OSS below the value line; our policy model, control plane, and evidence layer above it. Swappability is a tested property, not an aspiration. — *X-3*
4. **Fail visibly, not silently.** Every decision — allow, block, redact, escalate — is recorded with its reason, the rule that fired, and the evidence. A guardrail that blocks without an auditable reason is a bug. — *X-4*
5. **Correctness is in scope.** We govern whether the agent *worked*, not only whether it was *safe*. This is the line between us and pure-security vendors. — *X-5*
6. **Evidence is a first-class artefact.** Everything the platform observes must be exportable as something an auditor accepts: tamper-evident, timestamped, complete for a stated period, and independently verifiable. — *X-6*
7. **Latency is a product constraint, not an implementation detail.** Inline enforcement has a hard budget (NFR-1). Detectors that exceed it degrade to async-observe rather than blocking the customer's agent. — *X-7*
8. **The customer's data stays in the customer's boundary.** Self-host and VPC deployment are day-one architecture decisions, not a Phase-2 port. — *X-8*

---

## 6. Scope

### 6.1 In scope for the product (all phases)

All six pillars in §7, delivered across four phases (§14), on three integration surfaces (gateway, SDK, OTel ingest), for three customer tiers.

### 6.2 In scope for MVP v0.1 (this build)

**A thin, functional slice across all six pillars**, with depth in Pillars 3 (runtime), 4 (evaluation) and 5 (audit).

**Why a thin slice rather than a deep Phase 0.** The roadmap's Phase 0 is the right *commercial* sequence — sell runtime security first, let it fund the compliance build. But three factors argue for touching all six pillars in the first engineering pass:

1. **The OSS catalog makes pillars 2, 3, 4 and 5 cheap.** Presidio, OPA/Cedar, promptfoo, Garak/PyRIT and OpenTelemetry are mature, permissive, and cover the primitives. The marginal cost of a working slice of each is weeks, not quarters. Not taking that leverage would be the mistake.
2. **The compliance pillar's value is cumulative.** Control mappings, evidence formats and the risk register get better with every trace they see. Starting the data model in Phase 2 means starting from zero in Phase 2. Starting it now means Phase 2 is a UI and content problem, not an architecture problem.
3. **§3.3's principal risk is that rivals reach compliance before we reach runtime depth.** A thin compliance pillar from day one is the hedge.

**What "thin" means, precisely:** each pillar is functional end-to-end for the demo path and the seeded fixtures, with the *interfaces* complete enough that Phase 1–2 work is additive. It does not mean production-hardened at Tier-C scale. Per-requirement MVP status is marked in §7.

### 6.3 Out of scope for MVP v0.1

- Multi-tenancy beyond a single logical org (schema supports it; enforcement is single-org).
- Real SSO/SCIM against an IdP (RBAC and the SAML/OIDC seam exist; no live IdP integration).
- Managed cloud offering, billing, provisioning.
- Automated red-teaming *at scale* (the adapters and an offline probe suite exist; continuous scheduled campaigns do not).
- Cross-org benchmarking, partner marketplace (Phase 3).
- Non-text modalities (image/audio PII and safety). Presidio's image redaction is available but not wired.

### 6.4 Explicit non-goals (permanent)

Everything in §2.3, plus: we do not build a model, a vector database, an agent framework, or a sandbox runtime.

---

## 7. Functional requirements — the six pillars

### Pillar 1 — Discovery & Agent Registry
*"What agents do we even have?" — visibility first.*

| ID | Requirement | Tier | Phase | Source | MVP |
|---|---|---|---|---|---|
| **P1-1** | **Agent & tool inventory.** A canonical record for every agent, with the models, tools, MCP servers and datasets it uses. Records are created by explicit registration (API/CLI/UI) or automatically on first observation at the gateway. | B (Nice at A) | 0–1 | BUILD | ✅ |
| **P1-2** | **Shadow-agent detection.** Traffic observed at the gateway, in ingested OTel spans, or in provider audit logs that does not correlate to a registered agent raises a `shadow_agent` finding with first-seen, last-seen, call volume, models touched, and a suggested registration payload. | B (Critical at C) | 1 | BUILD | ✅ |
| **P1-3** | **Lineage & dependency map.** A queryable graph of agent → model, agent → tool, agent → data source, agent → sub-agent, derived from observed execution paths rather than declared config. Supports blast-radius queries ("what breaks / what is exposed if this tool is compromised"). | C (Nice at B) | 1–2 | BUILD | ◐ graph derived + queryable; no visual map in MVP |
| **P1-4** | **Ownership & metadata.** Every agent carries an accountable owner, business purpose, environment, deployment surface, data classes touched, and an assigned risk tier. Unowned agents are a reportable compliance finding. | B (Critical at C) | 0–1 | BUILD | ✅ |
| **P1-5** | **MCP server inventory & hygiene scanning.** Enumerate MCP servers an agent connects to; record tools, schemas and schema *changes* over time. Flag tool-poisoning indicators (instructions embedded in tool descriptions, silent schema drift, unpinned servers). | B | 1 | HYBRID — `mcp-scan` as an invoked **tool**, never a dependency (Snyk-owned) | ◐ native schema-drift + description-injection checks; mcp-scan adapter present, optional |
| **P1-6** | **Framework auto-discovery.** Detect the orchestration framework in use (LangGraph, CrewAI, AutoGen, LlamaIndex, Claude Agent SDK, ADK, bare SDK) from span attributes, and record it on the agent for neutrality reporting. | B | 1 | BUILD | ✅ |
| **P1-7** | **Registry drift & attestation.** Periodically re-attest that a registered agent's declared tools/models match what is observed; raise a finding on divergence. | C | 2 | BUILD | ◐ divergence detected on ingest; no scheduled re-attestation job |

**Design note.** P1-3's insistence on *observed* rather than *declared* lineage is deliberate and is a differentiator against GRC incumbents, whose registries are self-reported forms. A registry that only knows what someone typed into it is the artefact Dana already has in a spreadsheet.

---

### Pillar 2 — Identity, Access & Authorization
*"What is this agent allowed to touch?" — least privilege.*

| ID | Requirement | Tier | Phase | Source | MVP |
|---|---|---|---|---|---|
| **P2-1** | **Non-human identity (NHI).** Every agent has a governed machine identity: credential issuance, scoped capabilities, rotation, revocation, expiry, last-used, and posture (stale/over-privileged/orphaned). | B (Critical at C) | 1–2 | BUILD | ✅ issuance, rotation, revocation, expiry, posture findings |
| **P2-2** | **Tool-scoped least privilege.** Per-agent, per-tool, per-action permissions evaluated on every tool call, including argument-level constraints (e.g. `payments.transfer` allowed only when `amount < 1000` and `currency == "USD"`). Default deny. | A (Critical at B, C) | 0 | REUSE — **OPA/Rego** decision engine (Cedar-compatible seam), BUILD — agent-native authoring layer | ✅ |
| **P2-3** | **Human-in-the-loop approvals.** A policy outcome that suspends execution, emits an approval request to a named approver/role with the full decision context, and resumes or aborts on response. Configurable timeout behaviour (deny-on-timeout default). | B (Critical at C, Nice at A) | 1 | BUILD | ✅ API + queue + resume/abort; notification is webhook-only |
| **P2-4** | **SSO / SCIM / RBAC.** Enterprise auth for the control plane: OIDC/SAML SSO, SCIM user/group provisioning, and the role matrix in §4.2. | A (Critical at B, C) | 1 | REUSE — standard OIDC/SAML libs; BUILD — role model | ◐ RBAC + API keys + local users complete; OIDC/SAML seam present, not wired to an IdP |
| **P2-5** | **Delegation & sub-agent identity.** When an agent spawns a sub-agent, the child inherits a *narrowed* (never widened) capability set, and the delegation chain is recorded and enforced. | C | 2 | BUILD | ◐ chain recorded and narrowing enforced; no cross-process propagation |
| **P2-6** | **Credential brokerage.** Agents never hold long-lived third-party secrets; the control plane brokers short-lived, scoped credentials per tool call and records issuance. | C | 2–3 | BUILD | ✗ specified only |
| **P2-7** | **Policy simulation ("what would happen").** Dry-run a policy change against the last N days of recorded execution paths and report what would newly block, newly allow, or newly escalate — before the change is enforced. | B | 1–2 | BUILD | ✅ |

**Design note.** P2-7 is disproportionately important for adoption. The reason security tooling gets configured permissively and left there is that nobody can predict what tightening a rule will break. Replaying real traffic against a candidate policy converts a scary change into a reviewed diff — and it is only possible because Pillar 5 already stores the full execution path.

---

### Pillar 3 — Runtime Guardrails & Security
*"Stop the bad thing before it happens" — inline defence.*

| ID | Requirement | Tier | Phase | Source | MVP |
|---|---|---|---|---|---|
| **P3-1** | **Prompt-injection & jailbreak defence.** Inline detection and blocking on user input, retrieved content, tool *results*, and sub-agent output. Must cover indirect injection (the payload arrives via RAG or a tool response, not the user). | A (Critical at B, C) | 0 | HYBRID — BUILD heuristic + structural analysers; REUSE optional transformer classifiers (Granite Guardian preferred on licence grounds) | ✅ |
| **P3-2** | **PII / DLP & output filtering.** Detect and act on personal and sensitive data in **both** directions (into the model, and out to the user or a tool). Actions: allow, redact, mask, tokenise, block. Configurable entity sets per jurisdiction. | A (Critical at B, C) | 0 | REUSE — **Presidio** (MIT, de-facto standard); BUILD — policy/action layer, tokenisation, jurisdiction packs | ✅ |
| **P3-3** | **Secrets & credential leakage detection.** Detect API keys, tokens, private keys and high-entropy strings in prompts, outputs and tool arguments. | A | 0 | BUILD (regex + entropy; cheap and better done natively) | ✅ |
| **P3-4** | **Tool-call containment (intent-based).** Policy evaluated over the **full execution path**, not a single string: the tool, its arguments, the provenance of those arguments (did they originate in untrusted retrieved content?), the sequence of prior calls, and the declared task intent. Blocks the *action*, not the phrasing. | B (Critical at C, Nice at A) | 0–1 | BUILD (this is the agent-native differentiator over model-era filters) | ✅ |
| **P3-5** | **Content safety / toxicity / harm classification.** Category-scored classification of input and output against a configurable policy (harm, harassment, self-harm, illicit, etc.). | A | 0–1 | REUSE — **Granite Guardian** (Apache-2.0) default; Llama Guard / ShieldGemma as opt-in adapters with licence gating | ◐ heuristic lexicon + classifier adapter; weights not bundled |
| **P3-6** | **Low-latency inline enforcement.** Hard p95 budget (NFR-1). Detectors run concurrently with per-detector timeouts; anything over budget degrades to observe-only for that request and raises an operational finding. | B (Critical at C, Nice at A) | 0 | BUILD | ✅ |
| **P3-7** | **Fail-open / fail-closed by policy.** Per-policy, per-environment choice of behaviour when a detector errors or times out, with the choice itself recorded as a governed, audited setting. | B | 0 | BUILD | ✅ |
| **P3-8** | **Data residency / VPC / self-host.** Full functionality with no egress from the customer boundary; no telemetry, prompts or outputs leave unless explicitly configured. | C (Nice at B) | 2 | BUILD (architectural from day one — X-8) | ✅ self-host is the default and only MVP deployment mode |
| **P3-9** | **Output schema & format enforcement.** Validate model output against a declared schema/contract; on violation, repair, retry or block per policy. | A | 1 | REUSE — **Guardrails AI** validators / **NeMo Guardrails** rails as adapters; BUILD — policy binding | ◐ native JSON-schema validator; NeMo/Guardrails-AI adapters present, optional |
| **P3-10** | **Rate, cost & loop containment.** Per-agent budgets on calls, tokens, spend and recursion depth; detect and break runaway tool loops. | B | 1 | BUILD | ✅ |
| **P3-11** | **Detector swappability & benchmarking.** Any detector is replaceable by config; the platform measures each detector's latency, and (where labelled fixtures exist) precision/recall, so the choice is evidence-based. | B | 1 | BUILD | ✅ |

**Design note on P3-1 and P3-4 together.** The market's model-era filters ask "is this string malicious?". The agent-native question is "should this *action* happen, given where its arguments came from?". We implement **taint tracking**: content arriving from untrusted sources (retrieved documents, tool results, sub-agent output, user input) is tagged, the tag propagates into tool-call arguments, and policy can require that a high-impact tool never receives tainted arguments without a human approval. This is the single most defensible piece of runtime engineering in the product, and it is not available in any OSS project surveyed.

---

### Pillar 4 — Evaluation & Reliability Assurance
*"Does it actually work?" — the eval-gap wedge, and the line between us and pure-security vendors.*

| ID | Requirement | Tier | Phase | Source | MVP |
|---|---|---|---|---|---|
| **P4-1** | **Offline evaluation + CI regression gating.** Run a dataset of cases against an agent/prompt/model configuration, score with configurable scorers, compare to a baseline, and **fail the build** on regression beyond a threshold. Exit codes and JUnit/SARIF output for CI. | A (Core at all tiers) | 0 | REUSE — **promptfoo** (MIT, purpose-built for CI gating) as a runner adapter; BUILD — native runner, domain scorers, gating semantics, governance tie-in | ✅ |
| **P4-2** | **Online / production evaluation + drift.** Sample live traffic, score it with the same scorers as offline, and track score distributions over time. Alert on drift (PSI / KS / mean-shift) against a declared baseline window. | B (Critical at C, Nice at A) | 1 | BUILD | ✅ |
| **P4-3** | **Silent-failure detection.** Detect plausible-but-wrong outputs — the ~78% of failures nobody catches. Signal families: (a) **groundedness** — output claims unsupported by retrieved context; (b) **self-consistency** — divergence across resampled generations; (c) **contract violation** — output violates a declared schema, format or invariant; (d) **behavioural anomaly** — tool-call sequence, latency, length or refusal patterns outside the learned envelope; (e) **hedging/uncertainty markers**; (f) **task-completion failure** — the agent stopped without satisfying the declared goal. | B (Core at C) | 1 | BUILD — **no OSS project does this; this is the category we intend to own** | ✅ (a)–(f) implemented as scorers; ensemble scoring, learned envelope is statistical not ML |
| **P4-4** | **Automated red-teaming.** Continuous adversarial testing across injection, jailbreak, data-exfiltration, tool-abuse, and policy-bypass probes, with results tracked as a security posture over time. | C (Nice at B) | 2 | REUSE — **Garak** (Apache-2.0) scanner + **PyRIT** (MIT) orchestrated attacks + **Giskard** scan; BUILD — campaign scheduling, posture scoring, control tie-in | ◐ built-in offline probe suite + Garak/PyRIT adapters; no scheduled campaigns |
| **P4-5** | **Scorer library & custom scorers.** First-party scorers (exact/fuzzy match, JSON-schema, regex, groundedness, self-consistency, safety, latency, cost, tool-trajectory) plus a plugin interface for domain scorers, including LLM-as-judge with a pinned judge model and recorded rubric. | A | 0–1 | BUILD | ✅ |
| **P4-6** | **Datasets & golden sets.** Versioned evaluation datasets, importable from traces ("promote this production failure to a test case"), with labels, splits and provenance. | A | 0–1 | BUILD | ✅ |
| **P4-7** | **Reliability SLOs.** Declare a target (e.g. "groundedness ≥ 0.9 on p95 of production traffic"), measure continuously, and surface error budget burn. Feeds the compliance control for performance monitoring. | C | 2 | BUILD | ✅ |
| **P4-8** | **Cross-model comparison.** Run the same evaluation across models/providers and report a comparison. **The neutrality proof-point** — the feature a model provider structurally will not do well. | B | 1 | BUILD | ✅ |

**Design note.** P4-3 is the highest-leverage requirement in the document. Observability is at 89–94% adoption and is table-stakes; evaluation is at ~52% offline / 37% online with 22.8% running none. The gap is not "teams cannot see their agents" — it is "teams cannot judge them". Silent-failure detection is the sharpest expression of that gap, it has no OSS equivalent, and it is what lets a governance product claim it governs *correctness* and not merely safety.

---

### Pillar 5 — Audit, Observability & Traceability
*"Show me exactly what happened" — the evidence layer.*

| ID | Requirement | Tier | Phase | Source | MVP |
|---|---|---|---|---|---|
| **P5-1** | **Full execution-path trace.** Every prompt, model call, retrieval, tool call and argument, sub-agent delegation, guardrail decision, approval and error, as a single correlated trace with parent/child structure and timing. | A (Critical at C) | 0 | REUSE — **OpenTelemetry** + OpenLLMetry semantic conventions as the wire format; BUILD — agent-native span model and correlation | ✅ |
| **P5-2** | **Tamper-evident audit log.** An append-only log of every governance-relevant event, hash-chained (each entry binds the previous entry's digest), with periodic signed checkpoints and an independent verification routine that detects insertion, deletion, reordering and mutation. | B (Critical at C, Nice at A) | 1 | BUILD — **OTel gives spans; the evidentiary layer is ours** | ✅ |
| **P5-3** | **Auditor-ready evidence export.** One-click evidence package for a stated scope (agent(s) × period × control(s)) containing the relevant traces, decisions, policy versions in force at the time, eval results, approvals, a control-by-control narrative, and a manifest with per-file digests plus the chain verification result. | C (Nice at B) | 2 | BUILD | ✅ |
| **P5-4** | **SIEM / OTel integration.** Export decisions and findings to the customer's existing SOC: OTLP, JSON Lines, CEF/LEEF, and webhook. Never require the customer to adopt our storage as their system of record. | B (Critical at C, Nice at A) | 1 | REUSE — OTel exporters; BUILD — CEF/LEEF mappers and event taxonomy | ✅ |
| **P5-5** | **Retention, redaction & legal hold.** Configurable retention per data class; redaction of sensitive content *at capture* so that the audit log never becomes a new PII liability; legal hold that suspends deletion for a defined scope. | C | 2 | BUILD | ✅ redaction-at-capture + retention policy + legal hold; no automated deletion daemon in MVP |
| **P5-6** | **Trace search & replay.** Query traces by agent, decision, verdict, entity type, tool, time and content; open a single execution path end-to-end; replay it against a candidate policy or model (feeds P2-7 and P4-8). | A | 0–1 | BUILD | ✅ |
| **P5-7** | **Provenance & chain-of-custody for evidence.** Every exported artefact records who generated it, when, over what scope, against which policy version and code version, and is independently verifiable without access to our systems. | C | 2 | BUILD | ✅ |

**Design note on P5-2.** "Immutable" in a startup's product usually means "we do not have a DELETE endpoint". That does not survive an auditor. We implement a genuine hash chain: `entry.digest = H(seq ‖ timestamp ‖ payload_digest ‖ prev_digest)`, with checkpoints signed by a key held outside the application database, and a `verify` routine that any third party can run against an export. This is cheap to build correctly at the start and effectively impossible to retrofit — the entries you already wrote were never chained.

---

### Pillar 6 — Policy & Compliance Management
*"Prove we meet the rules" — the CISO/GRC pillar, and the part with essentially no OSS coverage.*

| ID | Requirement | Tier | Phase | Source | MVP |
|---|---|---|---|---|---|
| **P6-1** | **Policy-as-code engine.** One policy definition that drives **both** runtime enforcement and audit reporting. Human-authorable declarative policies (YAML) compiled to a decision engine, versioned, diffable, reviewable, with a stated author and effective time range. | B (Critical at C, Nice at A) | 0–2 | REUSE — **OPA/Rego** (CNCF-graduated) as the decision engine; BUILD — agent-native authoring layer, versioning, "write once, enforce + report" binding | ✅ (native evaluator + OPA sidecar adapter, both) |
| **P6-2** | **Control catalog & framework mapping.** A catalog of platform controls, each mapped to **EU AI Act**, **NIST AI RMF (+ Generative AI profile)**, **ISO/IEC 42001**, **SOC 2**, **OWASP LLM Top 10**, **OWASP Agentic Top 10** and **MITRE ATLAS**. Map once, satisfy many. | B (Critical at C, Nice(SOC 2) at A) | 2 | BUILD — **essentially no OSS exists here; adopt OWASP/ATLAS as the risk *language*** | ✅ 30+ controls mapped across 7 frameworks |
| **P6-3** | **Agent risk register & assessment.** Per-agent risk tiering (incl. EU AI Act risk classification: prohibited / high-risk / limited / minimal), structured assessment questionnaires, mitigations, residual risk, review cadence and sign-off. | B (Critical at C) | 2 | BUILD | ✅ classification + register + assessment; questionnaire content is a starter set |
| **P6-4** | **Continuous compliance monitoring.** Each control's status is *computed from telemetry* — not attested in a form — and is one of `effective` / `degraded` / `failing` / `not_implemented` / `not_applicable`, with the evidence that produced the status and a trend. | C | 2 | BUILD | ✅ |
| **P6-5** | **Obligation calendar.** Track regulatory obligations and their dates against the customer's agent inventory: which agents are in scope for which obligation, and what is outstanding. Seeded with the EU AI Act phased schedule. | C | 2 | BUILD | ✅ |
| **P6-6** | **Board / exec risk dashboard.** Up-and-out view: agent population by risk tier, control effectiveness, open findings by severity, incidents blocked, compliance posture by framework, trend. | C (Core at B) | 2–3 | BUILD | ✅ API + dashboard view |
| **P6-7** | **Policy packs.** Pre-built, importable policy + control bundles per regime and per vertical (EU AI Act high-risk, HIPAA, PCI-DSS, DORA, financial services), so a customer starts from a defensible baseline. | C | 2–3 | BUILD | ◐ EU AI Act high-risk + SOC 2 baseline packs shipped; verticals specified only |
| **P6-8** | **Framework versioning.** Frameworks change (the EU AI Act omnibus delay is the live example). Mappings are versioned, and a change produces a diff of what it means for the customer's controls. | C | 3 | BUILD | ◐ versioned catalog; no diff engine |

**Design note.** P6-4 is the difference between a compliance product and a compliance *theatre* product. Credo AI and OneTrust largely collect attestations. We compute status from the same execution data that drives runtime enforcement — because we are inline, we can. That is a claim only an agent-native platform can make, and it is why the compliance pillar must be built on top of the runtime pillar rather than beside it.

---

### Cross-cutting requirements

| ID | Requirement | MVP |
|---|---|---|
| **X-1** | **Three integration surfaces**, all additive and independently sufficient: (a) inline **gateway** — OpenAI/Anthropic-compatible proxy, zero code change; (b) **SDK** — decorators/context managers for in-process enforcement and richer intent capture; (c) **OTel ingestion** — passive observation of existing telemetry. | ✅ all three |
| **X-2** | **Provider & framework neutrality.** Adapter layer for model providers (OpenAI, Anthropic, Google, Bedrock, Azure, local/vLLM) and frameworks (LangGraph, CrewAI, AutoGen, LlamaIndex, Claude Agent SDK, ADK). Adding a provider must not touch core. | ✅ adapter layer + OpenAI/Anthropic/echo(offline) providers |
| **X-3** | **Offline-first.** Every capability degrades to a functional local implementation with no third-party API key and no downloaded weights. Upgrading to hosted models/classifiers is configuration, never a rewrite. | ✅ |
| **X-4** | **Deterministic decisions.** Given the same input, policy version and detector versions, a decision is reproducible and replayable. Non-deterministic components (LLM judges) are pinned and their outputs recorded. | ✅ |
| **X-5** | **Everything through the API.** The dashboard is a client of the same public API as the CLI and SDK; no privileged back-channel. | ✅ |

---

## 8. Feature × company-tier matrix

The same product means different things at different scale. A 900-person scale-up buys safety + speed; a Fortune-500 bank buys audit, residency and compliance. **The "Critical" column shifts rightward and downward — that shift *is* the expansion path.**

Legend: **Critical** = deal-maker, they will not buy without it · **Core** = expected in the platform · **Nice** = valued, not decisive · **—** = not needed at this tier.

| Feature | A · Mid-market (~500–2k) | B · Enterprise (2k–10k) | C · Large / regulated (10k+) |
|---|---|---|---|
| **1 · Discovery & Registry** | | | |
| Agent & tool inventory | Nice | Core | **Critical** |
| Shadow-agent detection | — | Core | **Critical** |
| Lineage & dependency map | — | Nice | Core |
| Ownership & metadata | Nice | Core | **Critical** |
| MCP inventory & hygiene | Nice | Core | **Critical** |
| **2 · Identity, Access & Authorization** | | | |
| Tool-scoped least privilege | Core | **Critical** | **Critical** |
| Non-human identity (NHI) | — | Core | **Critical** |
| Human-in-the-loop approvals | Nice | Core | **Critical** |
| SSO / SCIM / RBAC | Core | **Critical** | **Critical** |
| Delegation & sub-agent identity | — | Nice | Core |
| **3 · Runtime Guardrails & Security** | | | |
| Prompt-injection / jailbreak defence | Core | **Critical** | **Critical** |
| PII / DLP & output filtering | Core | **Critical** | **Critical** |
| Secrets leakage detection | Core | Core | **Critical** |
| Tool-call containment (intent-based) | Nice | Core | **Critical** |
| Low-latency inline enforcement (<100ms) | Nice | Core | **Critical** |
| Data residency / VPC / self-host | — | Nice | **Critical** |
| **4 · Evaluation & Reliability** | | | |
| Offline eval + regression gating | Core | Core | Core |
| Online / production eval + drift | Nice | Core | **Critical** |
| Silent-failure detection | Nice | Core | Core |
| Automated red-teaming | — | Nice | **Critical** |
| Cross-model comparison | Nice | Core | Core |
| **5 · Audit, Observability & Traceability** | | | |
| Full execution-path trace | Core | Core | **Critical** |
| Immutable / tamper-evident audit log | Nice | Core | **Critical** |
| Auditor-ready evidence export | — | Nice | **Critical** |
| SIEM / OpenTelemetry integration | Nice | Core | **Critical** |
| Retention / redaction / legal hold | — | Nice | **Critical** |
| **6 · Policy & Compliance** | | | |
| Policy-as-code engine | Nice | Core | **Critical** |
| Framework mapping | Nice (SOC 2 only) | Core | **Critical** |
| Agent risk register | — | Core | **Critical** |
| Continuous compliance monitoring | — | Nice | **Critical** |
| Board / exec risk dashboards | — | Nice | Core |

**Product consequence:** land Tier A/B on security + reliability; expand into Tier C as the compliance pillar matures. **Do not build Tier-C compliance features before Tier-B design partners are using the runtime + audit core.** MVP v0.1's thin compliance slice exists to establish the data model and prove the story in a demo — not to sell Tier C.

---

## 9. Architecture

### 9.1 Shape

```
                ┌──────────────────────────────────────────────────┐
                │            Control plane (Next.js UI)            │
                │  registry · incidents · traces · evals · policy  │
                │            compliance · board view               │
                └───────────────────────┬──────────────────────────┘
                                        │  public REST API (X-5)
┌───────────────┐   ┌────────────────────┴───────────────────────────────┐
│  Customer's   │   │                Nometria core                       │
│    agent      │   │                                                    │
│               │   │  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │
│ ┌───────────┐ │   │  │  Pillar 1   │  │   Pillar 2   │  │ Pillar 6  │ │
│ │  SDK      │─┼───┼─▶│  Registry   │  │  Identity &  │  │  Policy & │ │
│ │  (X-1b)   │ │   │  │  Discovery  │  │  Authz (OPA) │  │Compliance │ │
│ └───────────┘ │   │  └─────────────┘  └──────────────┘  └───────────┘ │
│      or       │   │                                                    │
│ ┌───────────┐ │   │  ┌──────────────────────────────────────────────┐ │
│ │  Gateway  │─┼───┼─▶│      Pillar 3 — Guardrail engine             │ │
│ │  (X-1a)   │ │   │  │  taint tracking · detector pipeline · budget │ │
│ └───────────┘ │   │  │  Presidio | injection | secrets | safety |…  │ │
│      or       │   │  └───────────────────────┬──────────────────────┘ │
│ ┌───────────┐ │   │                          │  decisions             │
│ │ OTel SDK  │─┼───┼─▶┌───────────────────────▼──────────────────────┐ │
│ │  (X-1c)   │ │   │  │   Pillar 5 — Trace + tamper-evident audit    │ │
│ └───────────┘ │   │  └───────────────────────┬──────────────────────┘ │
└───────────────┘   │                          │                        │
                    │  ┌───────────────────────▼──────────────────────┐ │
                    │  │   Pillar 4 — Evaluation & reliability        │ │
                    │  │  offline/CI · online/drift · silent-failure  │ │
                    │  │  red-team (Garak/PyRIT/promptfoo adapters)   │ │
                    │  └──────────────────────────────────────────────┘ │
                    └────────────────┬───────────────────────────────────┘
                                     │
                     ┌───────────────┴────────────────┐
                     ▼                                ▼
              Model providers                   SIEM / OTLP
        (OpenAI, Anthropic, Google,         (customer's SOC —
         Bedrock, Azure, local) — X-2        never our lock-in)
```

### 9.2 Components

| Component | Module | Responsibility |
|---|---|---|
| **Core** | `nometria.{models,db,config,enforcement}` + pillar packages `registry`, `identity`, `guardrails`, `policy`, `evaluation`, `audit`, `compliance` | Domain model, persistence, policy model, all six pillar services. No transport. |
| **Providers** | `nometria.providers` | Model-provider adapter layer (X-2). `echo` is the offline default. |
| **Gateway** | `nometria.gateway` | FastAPI app: OpenAI/Anthropic-compatible inline proxy + the public control-plane API + OTLP ingest. |
| **SDK** | `nometria.sdk` | In-process Python client: decorators, context managers, tagged content for provenance. Local or remote against a gateway. |
| **CLI** | `nometria.cli` | `nometria eval gate` (CI gating), `evidence export`, `audit verify`, `scan mcp`, `policy simulate`, `redteam run`, `compliance status`, `seed`, `demo`, `serve`. |
| **Dashboard** | `dashboard/` | Next.js control plane. Pure API client. |
| **Policies** | `policies/` | Declarative YAML policy packs (compiled to Rego on demand). |
| **Compliance content** | `compliance/` | Control catalog and obligation calendar as versioned YAML. |

Distributed as a single `nometria` package with optional extras per wrapped OSS
primitive (`pii`, `classifiers`, `rails`, `validators`, `redteam`, `otel`, `postgres`)
so the offline default install stays dependency-light — see §12.1 and `pyproject.toml`.

### 9.3 Request path (inline enforcement)

1. Request arrives at gateway (or SDK boundary) with an agent identity.
2. **Identity resolution** — resolve NHI, agent record; unregistered → shadow finding (P1-2), then continue per policy.
3. **Taint annotation** — mark untrusted content sources (P3-4).
4. **Pre-flight detector pipeline** — concurrent, budgeted (P3-6): injection, PII, secrets, safety.
5. **Policy decision** — declarative policy + Rego over the full context: agent, tool, arguments, taint, detector findings, budgets, prior calls (P2-2, P3-4, P6-1). Outcome ∈ `allow | redact | block | escalate`.
6. **Escalation** → suspend, create approval, await/resume (P2-3).
7. **Forward to provider** (adapter, X-2) or return a block.
8. **Post-flight pipeline** on the response — PII/DLP outbound, safety, schema, silent-failure scorers sampled (P3-2, P3-9, P4-3).
9. **Emit** — trace spans (P5-1), audit chain entries (P5-2), SIEM events (P5-4), compliance signals (P6-4).

### 9.4 The build-vs-reuse seam

Every OSS primitive sits behind one of four interfaces, which is how X-3 (swappability) is made a tested property rather than a claim:

| Interface | Contract | OSS implementations |
|---|---|---|
| `Detector` | `detect(content, context) -> Findings` | Presidio, Granite Guardian, native heuristics, NeMo/Guardrails-AI rails |
| `PolicyEngine` | `decide(input) -> Decision` | OPA/Rego, native evaluator (Cedar seam) |
| `EvalRunner` | `run(suite, target) -> Results` | native, promptfoo |
| `RedTeamRunner` | `probe(target, campaign) -> Findings` | native probe suite, Garak, PyRIT, Giskard |
| `ModelProvider` | `complete(request) -> Response` | OpenAI, Anthropic, Google, Bedrock, local, echo (offline) |

### 9.5 Deployment

**MVP:** single Docker Compose stack — gateway, OPA sidecar, Postgres (or SQLite for zero-infra), dashboard. Self-host is the default and only mode (X-8, P3-8). No egress. Managed cloud is Phase 2+ and is not a different codebase.

---

## 10. Data model

Summary; full schema in [Appendix D](appendix-d-data-model.md).

**Pillar 1:** `Agent`, `AgentVersion`, `Tool`, `McpServer`, `McpToolSnapshot`, `LineageEdge`, `Finding`
**Pillar 2:** `Identity`, `Credential`, `Capability`, `ApprovalRequest`, `User`, `Role`, `DelegationEdge`
**Pillar 3:** `DetectorRun`, `DetectionFinding`, `TaintTag`, `Budget`
**Pillar 4:** `EvalSuite`, `EvalCase`, `EvalRun`, `EvalResult`, `Scorer`, `Baseline`, `DriftWindow`, `RedTeamCampaign`, `SLO`
**Pillar 5:** `Trace`, `Span`, `AuditEntry` (hash-chained), `AuditCheckpoint`, `EvidencePackage`, `LegalHold`, `RetentionPolicy`
**Pillar 6:** `Policy`, `PolicyVersion`, `Decision`, `Control`, `FrameworkMapping`, `ControlStatus`, `RiskAssessment`, `Obligation`

**Invariants worth stating in a PRD because they constrain engineering:**
- `AuditEntry` is append-only; there is no update or delete path in code, and the chain is verified independently (P5-2).
- `Decision` always references the exact `PolicyVersion` in force at decision time — policies are never mutated in place (P6-1, X-4).
- `Capability` narrowing is enforced on `DelegationEdge` creation; widening is rejected at write time, not audited after the fact (P2-5).

---

## 11. API surface

Full specification in [Appendix C](appendix-c-api-spec.md). Shape:

- **Inline** — `POST /v1/chat/completions` (OpenAI-compatible), `POST /v1/messages` (Anthropic-compatible), `POST /v1/guard/{input,output,tool_call}` (direct enforcement without proxying).
- **Registry** — `/api/agents`, `/api/tools`, `/api/mcp-servers`, `/api/lineage`, `/api/findings`.
- **Identity** — `/api/identities`, `/api/credentials`, `/api/capabilities`, `/api/approvals`.
- **Policy** — `/api/policies`, `/api/policies/{id}/versions`, `/api/policies/simulate`.
- **Eval** — `/api/eval/suites`, `/api/eval/runs`, `/api/eval/gate`, `/api/eval/drift`, `/api/eval/slos`, `/api/redteam/campaigns`.
- **Audit** — `/api/traces`, `/api/traces/{id}`, `/api/audit/entries`, `/api/audit/verify`, `/api/evidence`, `/api/export/siem`.
- **Compliance** — `/api/controls`, `/api/frameworks`, `/api/compliance/status`, `/api/risk`, `/api/obligations`, `/api/board`.
- **Ingest** — `POST /v1/traces` (OTLP/HTTP).

---

## 12. Open-source strategy

### 12.1 Decisions

Full register with licence, health, verdict and risk in [Appendix A](appendix-a-oss-register.md). Headlines:

**Adopt on the critical path (all permissive, all active):**

| Layer | Pick | Licence | Why |
|---|---|---|---|
| PII detection/redaction | **Presidio** | MIT | De-facto standard, mature, extensible. Rebuilding is pure duplicated work. |
| Safety classifier | **Granite Guardian** (IBM) | Apache-2.0 | Cleanest licence in the classifier group — true Apache weights. |
| Guardrail orchestration | **NeMo Guardrails** / **Guardrails AI** | Apache-2.0 | Compose checks; don't hand-roll a runner. *(Adapters — our pipeline is the primary path; see 12.2.)* |
| Eval + CI gating | **promptfoo** | MIT | Purpose-built for regression gating in CI. |
| Red-teaming | **Garak** + **PyRIT** (+ Giskard) | Apache / MIT | Scanner + orchestrated adversarial suites. |
| Authorization / policy | **OPA (Rego)** | Apache-2.0 | CNCF-graduated, battle-tested, sub-ms. Cedar kept as a compatible seam. |
| Tracing / audit spine | **OpenTelemetry** + OpenLLMetry | Apache-2.0 | Industry standard; feeds our evidence layer. |
| Risk taxonomy | **OWASP LLM & Agentic Top 10**, **MITRE ATLAS** | Open | Map detections to a language buyers already trust. |

**Deliberately off the critical path:**

| Project | Why excluded | How we still use it |
|---|---|---|
| **LLM Guard** | Archived 9 Jul 2026 (Protect AI → Palo Alto). Excellent scanner design, dead dependency. | Mine the 15-input/20-output scanner taxonomy as a **design reference** for our detector coverage. |
| **Rebuff, Vigil** | Stale / low activity. | Reference for multi-layer injection detection patterns (canary tokens in particular). |
| **Invariant Guardrails / mcp-scan** | Acquired by **Snyk** — an incumbent building the same category. Most agent/MCP-native OSS guardrails, and precisely therefore the riskiest to depend on. | `mcp-scan` invoked as an **external tool** in P1-5, never linked as a dependency. |
| **Llama Guard / Prompt Guard, ShieldGemma** | Not OSI-approved. Llama Community Licence adds an AUP and a >700M-MAU clause; Gemma similar. Usable, but restricted. | Opt-in adapters behind an explicit licence acknowledgement flag. Granite Guardian is the default. |
| **systemprompt-core** | BSL-1.1 — source-available, **not** open source; usage restrictions today. | Reference only. |
| **OpenAI Guardrails** | MIT but OpenAI-centric; adopting it as the spine would contradict X-2. | Reference for config ergonomics. |
| **Langfuse** | MIT core and self-hostable, but ClickHouse-acquired with features behind an EE tier. | Supported as an *export target*, not as our storage. |
| **Microsoft Agent Governance Toolkit** | MIT, but a competitor-adjacent framing. | Reference for OWASP Agentic Top-10 coverage mapping. |

### 12.2 Where OSS runs out — and why that is the product

Coverage by pillar, from the catalog:

| Pillar | OSS coverage | Consequence |
|---|---|---|
| 3 · Runtime guardrails | **Well covered** | Wrap. Matching here is table-stakes, not differentiation. |
| 4 · Evaluation & reliability | **Good primitives** | Wrap the runners; **silent-failure detection has no OSS equivalent** — build. |
| 2 · Identity & authorization | **Engines yes, agent-native no** | Wrap OPA; build the agent-native capability model. |
| 5 · Audit & traceability | **Partial** — tracing yes, immutable/evidence no | Wrap OTel; build the evidentiary layer. |
| 1 · Discovery & registry | **Thin / competitor-owned** | Build. |
| 6 · Policy & compliance mapping | **Essentially none** | Build. This is the moat. |

The pattern is the strategy: the more commoditised a pillar, the more OSS is free; the more it is our moat, the less OSS exists — because it requires product integration and domain work, not a library.

### 12.3 Licence compliance obligations on us

- Maintain `THIRD_PARTY_NOTICES.md` with every dependency's licence (Apache-2.0 §4(d) attribution).
- Restricted-licence adapters (Llama Guard, ShieldGemma) are **not installed by default** and require an explicit config acknowledgement. No BSL dependency on any path.
- Re-verify licence and last-commit date for every critical-path project quarterly — the catalog's own caveat, and two projects changed status in the last twelve months.

---

## 13. Compliance framework coverage

Seven frameworks, one control set (P6-2). Full mapping in [Appendix B](appendix-b-control-catalog.md).

| Framework | Status | Why buyers ask |
|---|---|---|
| **EU AI Act** | Legally binding, phased | The demand pump (§14.2) |
| **NIST AI RMF** (+ Generative AI profile) | Voluntary | The US baseline buyers ask you to map to |
| **ISO/IEC 42001** | Certifiable AI management system | Increasingly required *of vendors* |
| **SOC 2** | Attestation | Tier-A's reason to buy — it unblocks *their* upmarket sales |
| **OWASP LLM Top 10** | Taxonomy | The security team's shared language |
| **OWASP Agentic Top 10** | Taxonomy | Agent-specific threat coverage |
| **MITRE ATLAS** | Threat matrix | Maps our detections to a matrix SOCs already use |

---

## 14. Roadmap

### 14.1 Phases

**Sequencing logic:** revenue-bearing security value first (Phase 0–1) funds the slow, expensive compliance build (Phase 2) — and by the time high-risk EU AI Act obligations bite (Dec 2027), the compliance pillar is mature. Building compliance first would mean 18 months of GRC engineering before a single "it works" demo: the wrong order for a startup.

| Phase | Window | Theme | Ships | Goal | Target tier |
|---|---|---|---|---|---|
| **0 · Beachhead** | 0–6 mo | The wedge that demos itself | Inline injection + PII/DLP guardrails (SDK/gateway); full execution-path trace → searchable log; offline eval + CI regression gating; basic tool-scoped permissions | 3–5 design partners; block a real incident on day one | A / B |
| **1 · Land** | 6–12 mo | Point tool → control plane | Agent registry + shadow-agent discovery; online eval + drift + silent-failure detection; immutable audit log + SIEM/OTel export; HITL approvals; SSO/RBAC | Become the single pane for "all our agents"; convert design partners to paid; first Tier-B logos | B |
| **2 · Expand** | 12–24 mo | Unlock the compliance buyer | Policy-as-code engine; framework mapping (EU AI Act, NIST, ISO 42001); risk register + auditor-ready evidence export; NHI management; residency / self-host / VPC | High-ACV Tier-C deals; CISO + GRC co-sign | C / regulated |
| **3 · Category** | 24 mo+ | The neutral standard | Cross-model / cross-cloud control plane; automated red-teaming at scale; board dashboards + cross-org benchmarking; partner/marketplace ecosystem | Own "agent governance" as a category; neutrality as the moat vs Microsoft/Palo Alto bundles | B + C |

**Phase 0 MVP, as the roadmap defines it:** a drop-in SDK/gateway that on day one (1) blocks prompt-injection and PII leakage, (2) records a full searchable execution-path trace, and (3) runs eval gates in CI so a bad agent cannot ship. One dashboard. No re-architecture. *Why this:* demonstrable in a 20-minute call, owned by a buyer who can say yes without procurement, and it plants the trace/audit spine every later pillar hangs off.

### 14.2 The regulatory clock

Compliance features do not sell on merit; they sell on deadlines. Align Phase-2 delivery to land ~12 months ahead of each obligation.

| Date | Obligation | Status | Pull |
|---|---|---|---|
| Feb 2025 | Prohibited practices enforceable; AI-literacy duties for all providers/deployers | **Live** | — |
| **2 Aug 2026** | Transparency obligations enforceable — disclose AI interaction, mark AI-generated content; market-surveillance authorities stand up | Near-term | **Now** |
| **2 Dec 2026** | GPAI grace period ends — general-purpose model obligations bite for Code-of-Practice signatories | Near-term | **Now** |
| **2 Dec 2027** | High-risk systems (Annex III) — standalone high-risk obligations apply (delayed from 2026) | Phase-2 target | Build now, sell 2027 |
| **2 Aug 2028** | High-risk embedded in products (Annex I) — full obligations | Phase-3 horizon | — |

Dates reflect the 2026 post-omnibus timeline. **The high-risk delay to Dec 2027 / Aug 2028 buys time to build the compliance pillar — but the Aug 2026 transparency and Dec 2026 GPAI obligations are demand triggers today.** Re-check before committing compliance-feature delivery dates; the schedule remains subject to further EU adjustment.

---

## 15. Non-functional requirements

| ID | Requirement | Target | Tier |
|---|---|---|---|
| **NFR-1** | **Inline enforcement latency.** Added p95 latency for the full pre-flight pipeline, excluding the model call. | **< 100 ms p95**, < 250 ms p99. Lakera targets <50ms — treat 50ms as the competitive bar for the heuristic path. Per-detector timeout default 40 ms. | A/B/C |
| **NFR-2** | **Availability.** Gateway is on the customer's critical path. | 99.9% self-hosted target; **no single point of failure that can take the customer's agent down** — P3-7 fail-open must be genuinely available. | B/C |
| **NFR-3** | **Throughput.** | 500 rps/node sustained on the heuristic path; horizontal scale-out, stateless gateway. | B/C |
| **NFR-4** | **Data residency.** | Zero egress by default. All processing in-boundary. Air-gap installable (no runtime package/model downloads). | C |
| **NFR-5** | **Audit integrity.** | Chain verification detects any insertion, deletion, reordering or mutation; verification is independently runnable against an export with no access to our systems. | B/C |
| **NFR-6** | **Retention.** | Configurable 30 d – 7 y per data class; legal hold overrides deletion. | C |
| **NFR-7** | **Security posture of the platform itself.** | SOC 2 Type II path; encryption at rest and in transit; secrets never logged; the audit log must not itself become a PII liability (redaction at capture, P5-5). | B/C |
| **NFR-8** | **Time to first value.** | Registered agent → first blocked incident visible in the dashboard in **< 10 minutes** from a cold start, with no code change. This is the Tier-A acquisition constraint. | A |
| **NFR-9** | **Offline operation.** | Full core functionality with no network egress and no model weights present. | All |
| **NFR-10** | **Determinism & replay.** | Same input + policy version + detector versions → same decision, replayable from stored traces. | B/C |

---

## 16. Success metrics

| Stage | Metrics |
|---|---|
| **Phase 0–1** | Design partners signed; **incidents blocked** (the demo-that-sells-itself metric); % of known agents traced; eval coverage %; time-to-first-block |
| **Phase 1–2** | Paid conversion; **agents under management**; time-to-audit-evidence; net revenue retention; % traffic with online eval |
| **Phase 2–3** | Tier-C logos; ACV expansion B→C; frameworks supported; **% ARR from compliance**; control effectiveness rate |

**Leading product-health indicators** (internal): p95 added latency, detector precision/recall on labelled fixtures, false-block rate (the metric that kills adoption if it drifts), silent-failure detection rate vs. human-labelled sample, chain verification success rate.

---

## 17. Risks & open decisions

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **A funded agent-security rival (Arthur, Zenity) adds compliance faster than we add runtime depth.** | High | Keep the runtime + eval lead; ship the compliance pillar thin-but-real from v0.1 so it compounds (§6.2). |
| R2 | **A provider bundles enough of this for free** (an AgentKit release with audit + policy). | High | Neutrality, compliance depth and evidence are structurally hard for them. Never build anything a provider could bundle as our *only* value. |
| R3 | **False blocks destroy trust.** A guardrail that blocks legitimate work gets turned off, and it never gets turned back on. | High | Observe-only mode by default; P2-7 policy simulation before enforcement; per-detector precision tracking; fast per-decision override + feedback loop. |
| R4 | **Latency budget breach** makes us a performance problem. | High | NFR-1 as a tested budget; concurrent detectors; degrade-to-observe (P3-6); heuristic fast path before any model-based detector. |
| R5 | **OSS dependency changes status** — two projects were archived or acquired in the last year. | Medium | Adapter interfaces (§9.4) make every OSS component swappable; quarterly licence/health re-verification (§12.3); nothing archived, BSL or competitor-owned on the critical path. |
| R6 | **Regulatory dates move** (they already did, via the omnibus delay). | Medium | Framework mappings are versioned content, not code (P6-8); obligation calendar is data. |
| R7 | **Compliance content is a bottomless pit** — mappings can absorb unlimited effort with no revenue. | Medium | Content is capped per phase and driven by design-partner demand; ship packs (P6-7), not bespoke mappings. |
| R8 | **The audit log becomes a new PII liability** — we would be centralising the exact data customers fear leaking. | Medium | Redaction at capture (P5-5); residency by default (NFR-4); customer-held keys for checkpoints. |
| R9 | **The market is small today** — ~$750M on dedicated agents, 5–16% true agents. | Medium | Accept: this is an early-market bet on a growing pain, not a large-market land-grab. Revenue timing risk, not thesis risk. |

**Open decisions requiring founder input** (carried from the roadmap; they change sequencing, not architecture):

1. **Horizontal vs. vertical beachhead.** A regulated-vertical entry (fintech, health, insurance) accelerates Tier-C credibility and yields proprietary compliance depth, at the cost of TAM per logo. Horizontal is bigger but meets the incumbents sooner. Depends on existing domain relationships. *This PRD assumes horizontal with an optional vertical overlay — P6-7 policy packs are the mechanism either way.*
2. **Bottoms-up vs. top-down entry.** This PRD assumes a bottoms-up security/platform wedge before the CISO/GRC motion. Existing enterprise/CISO relationships would invert Phases 0–2.
3. **Existing IP.** If there is existing eval or security IP to build from, the reuse boundary in §12 shifts.

---

## 18. Appendices

- [Appendix A — OSS Dependency Register](appendix-a-oss-register.md)
- [Appendix B — Control Catalog & Framework Mapping](appendix-b-control-catalog.md)
- [Appendix C — API Specification](appendix-c-api-spec.md)
- [Appendix D — Data Model](appendix-d-data-model.md)
- [Appendix E — Threat Model](appendix-e-threat-model.md)
- [Traceability — FR → implementation](traceability.md)

---

## 19. Sources & caveats

**Primary:** Menlo Ventures, *State of Generative AI in the Enterprise 2025* · Bessemer, *AI Infrastructure Roadmap 2026* · LangChain, *State of Agent Engineering* (n=1,340) · OpenAI, *AgentKit* announcement · Cleanlab, *AI Agents in Production 2025* (n=1,837). **Secondary:** CB Insights, Grand View Research, O'Reilly, Braintrust, StartupHub, SoftwareStrategies, presenc.ai, Arthur "Best AI Agent Security Platforms 2026", TrueFoundry buyer's guide, TechTarget / Modulos / Kovrr AI-governance guides 2026. **Regulatory:** EU AI Act post-omnibus timeline (Norton Rose Fulbright *Data Protection Report* Jul 2026; SIG summary Aug 2026; EU AI Act Service Desk), NIST AI RMF + GenAI profile, ISO/IEC 42001. **OSS:** project repositories and licence files as catalogued Aug 2026.

**Caveats.** Adoption and pain figures come from vendor-run surveys of self-selected agent builders — directional, not census-grade. Market-sizing projections diverge sharply by firm and are narrative, not planning input. Competitor capability claims come from 2026 buyer guides and shift quickly; validate before positioning against a named rival. Regulatory dates reflect the post-omnibus schedule and remain subject to EU adjustment. OSS licence and maintenance status change fast — the catalog's own scan found two critical projects archived or acquired within a year; re-verify before each release. Company-tier need levels (§8) are informed planning judgments, not survey data. Three claims from the original research were fact-checked and **refuted**, and are excluded here: "$4.7B raised across 59 agentic deals", "vertical agents = 55.7% of capital", "35% of Fortune 500 use LangChain".
