# PRD v2 — Agent Assurance

**Additive companion to [PRD.md](PRD.md).** v1 stays the foundation: six pillars, the architecture, the OSS strategy, the compliance engine. This document adds what v1 missed — the controls that address how enterprise agents *actually fail* — plus the platform work that makes any of it deployable.

| | |
|---|---|
| **Document** | PRD v2.0 — Agent Assurance |
| **Date** | 2026-08-18 |
| **Status** | Approved for build |
| **Inputs** | [gap-analysis.md](gap-analysis.md) · [failure-modes.md](failure-modes.md) · **[practitioner-signal.md](practitioner-signal.md)** — 11 senior AI engineer CVs |
| **Scope decision** | Failure-mode controls + Tier-0 platform blockers. Procurement (SSO, multi-tenancy, SOC 2) and Gartner-MQ items deferred to v3. |
| **Positioning decision** | **Horizontal.** No vertical beachhead. |
| **OSS decision** | **promptfoo dropped from the critical path** to an optional adapter (acquired by OpenAI, 9 Mar 2026). |

---

## 0. Why v2 exists

v1 asked the four questions an enterprise asks about an agent: *what is it, what can it do, does it work, can we prove it.* Those were the right questions and the answers hold.

But we validated the build against **vendor feature lists**, not against **incidents**. When we checked the incident data, the picture inverted:

| Failure class | Share of 10,000+ catalogued failure events |
|---|---|
| Resolution / escalation breakdowns | **31.1%** |
| Execution & action failures | **+62%** vs 2024 baseline |
| Hallucination-related | **< 10%** |

Our flagship differentiator — silent-failure detection — targets the **smallest** slice. Against a 50-mode failure taxonomy we cover **1 outright**.

### The repositioning (C12) — we compete with `git init`, not with vendors

[practitioner-signal.md](practitioner-signal.md) analysed 11 senior AI engineer CVs — Meta, Apple,
Waymo, Accenture, Deloitte, Philips, Emirates NBD, Itaú, HP, Nvidia, Amazon. The dominant finding:

> **6 of 11 independently hand-built a governance / guardrail / validation layer.**
> Aditya's "four-layer AI safety guardrail wrapping LangGraph". Derrick's "hierarchical policy
> framework (company → team → user)... reducing policy misconfigurations by **87%**". Leo's
> "configurable validation engine... users define custom rules **without developer intervention**".
> Jeremy's "hierarchical policies, Policy-as-Code". Siddhant's "hybrid rule-based + model-assisted
> verification". Rishabh's "HITL with regulator-grade auditability".

Six engineers, six companies, four industries, three continents — building the same component,
independently, because nothing off-the-shelf fit.

**Therefore the buyer is not choosing between us and Zenity. They are choosing between us and two
engineer-quarters of internal work.** That sets three hard product constraints:

1. **SDK-first.** The unit of adoption is `pip install` + useful in an afternoon, not a procurement.
   The control plane is what you graduate to, not what you start with.
2. **LangGraph-native.** 11/11 use LangGraph. Enforcement must be a LangGraph primitive
   (node hooks, checkpointer-aware, `interrupt()` for HITL) — not a proxy they route around.
3. **Compose with LangSmith/Langfuse, never replace them.** 7/11 and 4/11 respectively. Their traces
   stay theirs; we correlate decisions to them and push scores back.

### Corrections to earlier claims

The same evidence falsified things asserted in v1 and in the gap analysis. Recorded here so the
document is not read as stronger than it is:

| Earlier claim | Corrected |
|---|---|
| "Silent-failure detection — nobody does this" | **Wrong.** Aditya built hallucination detection cross-referenced against Azure AI Search; Rahul runs RAGAS faithfulness/precision/recall on live production pairs; Cleanlab/Vectara/Galileo productise it. Our groundedness is *lexical*; theirs is model-based. **We are behind, not ahead.** |
| "Tamper-evident audit is a differentiator" | **Overstated.** Rishabh delivered "regulator-grade auditability" to a bank with no hash chain. Cryptographic auditability was requested by nobody in 11 CVs. Keep it — cheap and true — but stop leading with it. |
| "The governance camp lacks runtime enforcement" | **Weakening.** Derrick and Jeremy both built runtime policy enforcement *inside* enterprises. The capability is not rare; the packaging is. |
| "Escalation breakdown is 31% and nobody addresses it" | **Half right.** Rishabh and Derrick built HITL escalation with audit trails. Only *detection of missed escalation* remains unclaimed. Claim narrowed accordingly. |

**v2 adds five questions a business asks that v1 never did:**

| Question | Pillar | Failure family |
|---|---|---|
| *Should it answer this at all?* | **7 — Answerability & Abstention** | F1 |
| *Where did that come from?* | **8 — Provenance & Source Authority** | F2 |
| *What will this action actually do?* | **9 — Action Assurance** | F3 |
| *Is this person allowed to see it?* | **10 — Entitlement & Disclosure** | F4 |
| *When must a human take over?* | **11 — Escalation Governance** | F5 |

Plus **Part II**, seven platform blockers without which none of it can be deployed inline.

**Design constraint carried from v1:** every requirement below is expressible on the existing `Detector` / `PolicyEngine` / `Scorer` / `ModelProvider` interfaces. v2 adds pillars, not architecture.

---

## 1. Scope

**In:** Pillars 7–11 (business failure controls) + Pillars 12–15 (practitioner-evidenced gaps), the integration surface I-1…I-14, platform hardening PL-1…PL-7, policy-language and data-model extensions, and 18 new controls with framework mappings.

**Out (deferred to v3):** SSO/SCIM, multi-tenancy enforcement, KMS, rate limiting, SOC 2 programme, connector framework, assessment-workflow engine, dynamic risk scoring, marketplace listings. All tracked in [gap-analysis.md](gap-analysis.md) Tiers 1–3.

**Permanent non-goals (unchanged from v1 §6.4):** we do not build a model, a vector database, an agent framework, or a sandbox runtime. v2 adds one: **we do not become the retrieval layer** — we govern retrieval, we do not replace it.

---

# Part I — New pillars

## Pillar 7 — Answerability & Abstention

*"If someone asks for future sales, the answer should be 'data not available', not a generated one."*

**Why this is a control and not a prompt.** Prompt engineering ("say I don't know if unsure") is the current answer, and it does not hold: **AbstentionBench** (20 datasets, 35k+ unanswerable queries) finds reasoning fine-tuning frequently *degrades* abstention — models are getting **worse** at this as they get more capable. A property that degrades with model upgrades cannot be left to the model. It has to be enforced outside it.

### The Knowledge Boundary

Each agent declares what it can possibly know. This is the artefact everything else in the pillar hangs off.

```yaml
knowledge_boundary:
  agent: sales-analytics
  systems_of_record:
    - key: salesforce.opportunities
      entity_types: [account, opportunity, pipeline]
      coverage: { from: 2019-01-01, to: now, granularity: day }
      freshness_sla: 24h
  answerable: [fact, aggregate, trend, definition]
  unanswerable: [prediction, opinion, causal, counterfactual, personal]
  out_of_scope_topics: [hr, legal, medical, compensation]
  abstention:
    template: "I don't have {reason}. {suggestion}"
    reasons:
      future_period: "data for a period that hasn't happened yet"
      before_coverage: "data from before {coverage_from}"
      unknown_entity: "a record for {entity}"
      out_of_scope: "access to {topic} information"
```

| ID | Requirement | Detail |
|---|---|---|
| **P7-1** | **Knowledge-boundary declaration** | Per agent: systems of record, entity types, temporal coverage, freshness SLA, answerable/unanswerable question types, out-of-scope topics. Versioned like a policy. |
| **P7-2** | **Pre-flight answerability classification** | Before generation, classify: (a) **temporal scope** — does the question reference a period outside coverage, including any future date; (b) **question type** — fact/aggregate/trend vs prediction/opinion/causal; (c) **entity scope** — optional existence check against the SoR; (d) **topic scope**. Deterministic first (date parsing + lexical intent markers), optional classifier second. |
| **P7-3** | **Forced abstention** | Out-of-boundary questions are answered from the template **without reaching the model**. Saves a token spend and, more importantly, removes the opportunity to fabricate. New verdict `abstain`. |
| **P7-4** | **Post-flight boundary verification** | Catch what pre-flight missed: numeric claims about periods outside coverage, entities not in retrieval, predictions phrased as records. |
| **P7-5** | **Prediction-vs-record register separation** | A forecast may be returned when the boundary permits it, but must be **labelled** — a projection asserted in the same register as an actual is the failure. |
| **P7-6** | **Over-refusal detection** | The inverse failure. Retrieval noise causes models to refuse what they could answer, which kills adoption. Track abstention rate against boundary-answerable questions; excess → finding, never a block. |
| **P7-7** | **Completeness signalling** | When retrieval returns a truncated or partial result set, the answer must say so. "Retrieved 3 of 50" answered as exhaustive is a silent failure. |

**Verdict lattice change.** `abstain` is inserted into the effect ordering:

```
allow(0) < tokenize(1) < mask(2) < redact(3) < abstain(4) < escalate(5) < block(6)
```

`abstain` is not a block — it returns a helpful, templated response. It ranks above redaction because it *replaces* the answer, and below escalation because it needs no human.

**Metric:** *unanswerable-question fabrication rate* — the share of boundary-violating questions that received a generated answer. Target 0.

---

## Pillar 8 — Provenance & Source Authority

*"How do we know it didn't use an unverified source?"*

**The hole in v1.** Our `groundedness` scorer checks the **answer against the retrieved context**. It never asks whether that context was **authoritative**. An answer faithfully grounded in a deprecated 2019 wiki page scores **1.0**. That is a lab metric wearing the costume of a control.

### Source tiers

| Tier | Meaning | Example |
|---|---|---|
| 1 `system_of_record` | Authoritative, owned, SLA'd | Salesforce, the ERP, the price book |
| 2 `approved` | Curated, reviewed, owned | Published policy pages, approved KB |
| 3 `unverified` | Internal but unowned | Personal OneNote, old wiki, meeting notes |
| 4 `external` | Outside the boundary | Public web, third-party docs |

| ID | Requirement | Detail |
|---|---|---|
| **P8-1** | **Source registry** | Every retrievable source: tier, owner, `updated_at`, refresh cadence, data classes, permitted topics. |
| **P8-2** | **Chunk provenance** | Every retrieved chunk carries `source_id`, tier, freshness and classification through the whole execution path and into the trace. |
| **P8-3** | **Tier policy** | Expressible as: *"financial figures may only come from tier-1 sources under 24h old."* Below-tier → block, caveat or escalate per policy. |
| **P8-4** | **Staleness enforcement** | Source age beyond its freshness SLA → the answer is caveated or refused. Directly addresses "the policy changed last week, the index is a month old." |
| **P8-5** | **Citation binding** | Decompose the answer into material claims; each must bind to a chunk that **supports** it. Reuses the groundedness machinery, but per-claim and with a source pointer rather than a single blended score. |
| **P8-6** | **Uncited-assertion detection** | A material claim with no supporting chunk is the fabrication signature. |
| **P8-7** | **Conflict disclosure** | When retrieved sources disagree on a value, silently picking one is a failure. Require disclosure or escalate. |
| **P8-8** | **Domain binding** | A support agent answering from the finance corpus is a scope failure even when the answer is correct. |

**This is the upgrade path for v1's differentiator.** `groundedness` becomes *one input* to an enforceable provenance control rather than a score on a dashboard.

**Metric:** *unauthoritative-answer rate* — answers whose material claims bind only to tier-3/4 sources.

---

## Pillar 9 — Action Assurance

*"How do we know the prompt can cause destructive changes to the DB?"*

**The hole in v1.** Our containment is **argument-level** on **declared tools** (`amount < 1000`). It has nothing to say about a **generated artefact** — SQL, a script, an API body — whose destructiveness lives in its *structure*, not its argument values. An agent with a legitimate `db.query` tool can pass `DROP TABLE users` as a perfectly well-formed string argument.

**How to do it correctly** (from the SQL-agent safety literature, and it is prescriptive): **deterministic parsing, not an LLM checking the SQL**, targeting **zero false negatives**, with **comments stripped first** — because `SELECT * FROM users -- ; DROP TABLE users` defeats naive keyword matching.

| ID | Requirement | Detail |
|---|---|---|
| **P9-1** | **Statement parsing** | Parse generated SQL to an AST via **sqlglot** (MIT, zero-dependency, 31 dialects). Comments stripped pre-parse. Unparseable input **fails closed** — an artefact we cannot analyse is one we cannot authorise. |
| **P9-2** | **Operation classification** | `SELECT` / `INSERT` / `UPDATE` / `DELETE` / DDL (`DROP`, `TRUNCATE`, `ALTER`, `CREATE`) / DCL (`GRANT`, `REVOKE`). Each maps to a reversibility class. |
| **P9-3** | **Stacked-statement rejection** | More than one statement in a single argument → block by default. This is the primary evasion path. |
| **P9-4** | **Unbounded-mutation detection** | `UPDATE`/`DELETE` with no `WHERE`, or with a tautological predicate (`WHERE 1=1`, `WHERE true`), is unbounded regardless of intent. |
| **P9-5** | **Blast-radius estimation** | Estimated affected rows, from `EXPLAIN` where available, else table cardinality metadata. **Policy is written against blast radius, not argument values** — `max_affected_rows: 1000`. |
| **P9-6** | **Environment binding** | Tool targets declare an environment; agents declare permitted environments. A `production` target from a staging-bound agent is blocked. **This alone prevents the 1.9M-row incident.** |
| **P9-7** | **State-verification preconditions** | An irreversible tool may require that a fact be **read back from the system of record** before it fires — not taken from the model's assertion. Directly prevents the HR welcome-email incident. |
| **P9-8** | **Idempotency enforcement** | Irreversible tools require a key derived from `(trace, tool, canonical_args)`. A replay inside the window is blocked as a duplicate. Prevents double refunds on retry. |
| **P9-9** | **Composed-privilege detection** | Detect a *sequence* that achieves what no single grant permits (read-then-exfiltrate, select-then-bulk-update). Evaluated over the execution path we already record. |
| **P9-10** | **Dry-run mode** | High-impact actions can be executed in explain-only mode, with the plan surfaced to an approver instead of executed. Makes an approval reviewable rather than a yes/no on an opaque call. |

### `requires_verified_state` — worked example

```yaml
tools:
  email.send_offer_acceptance:
    impact: irreversible
    environment: [production]
    preconditions:
      - verify: crm.candidate.status
        equals: "accepted"
        source_tier: system_of_record
        max_age: 5m
```

The model asserts the candidate accepted. The platform **reads the record**. Record says `pending`. The email never sends. That is the entire HR incident, closed.

**Metric:** *destructive-action interception rate* on a labelled corpus; **false-negative rate must be 0** — this control is worthless with any.

---

## Pillar 10 — Entitlement & Disclosure Control

*"The agent has an SDK for information that must not be given."*

**The most commercially valuable gap.** The Copilot research states it precisely: *"a governance failure rather than a security breach — **every permission check passed**."* The agent runs under its own service identity and inherits the union of everything it can reach. Nothing asks what **this requesting human** is entitled to see. One prompt — *"summarise our M&A discussions last quarter"* — surfaces everything the account can read.

This is why Copilot-class rollouts stall, and it is a problem stated in the buyer's own language.

| ID | Requirement | Detail |
|---|---|---|
| **P10-1** | **End-user principal propagation** | The *human* on whose behalf the agent acts flows through the gateway and SDK into retrieval and tool calls: subject id, groups/roles, tenant, clearance. Header `X-Nometria-End-User`; SDK `on_behalf_of`. **Without this nothing else in the pillar is possible.** |
| **P10-2** | **Retrieval pre-filtering** | Preferred mode: compute the resource set the principal may see (**OpenFGA** `ListObjects`, Apache-2.0, CNCF) and pass it as a retrieval filter. Nothing unauthorised is ever retrieved. |
| **P10-3** | **Retrieval post-filtering** | Fallback where the retriever cannot accept a filter: `Check` each returned chunk, drop unauthorised ones, and **record the drop** — the drop count is the oversharing metric. |
| **P10-4** | **Over-permission detection** | Continuously compare **agent reach** against **principal entitlement**. Where agent ⊃ principal, raise `over_permissioned_retrieval`. This is the "Copilot readiness report", computed continuously instead of as a one-off consulting exercise. |
| **P10-5** | **Cross-tenant assertion** | Hard invariant: every chunk's tenant equals the principal's tenant. A violation is `critical`, never suppressible. |
| **P10-6** | **Aggregation-disclosure control** | k-anonymity on returned aggregates. A "salary band" over a group of one is an individual's salary. Default k=5, per-data-class override. |
| **P10-7** | **Purpose limitation** | Data classes declare permitted purposes; the agent declares its purpose; mismatch blocks (GDPR Art. 5(1)(b)). |
| **P10-8** | **Restricted-content classes** | MNPI, blackout periods, legal hold, clearance levels — declarative exclusions independent of ACLs. |
| **P10-9** | **Inference-disclosure detection** | Output asserting a protected attribute never present in retrieval — the model inferred it. |

**Metric:** *entitlement-violating disclosure rate* (target 0) and *over-permission ratio* per agent — the second is the number that gets a Copilot rollout unblocked.

---

## Pillar 11 — Escalation Governance

**31.1% of all catalogued failures.** The largest single class, and v1 has zero coverage. We built HITL approvals for *policy* escalation; we have nothing that notices the agent **should have handed off and didn't**.

| ID | Requirement | Detail |
|---|---|---|
| **P11-1** | **Escalation policy** | Declarative `must_escalate_when` conditions: confidence below threshold, repeated failure, negative/distressed sentiment, regulated topic, repeated abstention, turn depth, explicit user request for a human. |
| **P11-2** | **Escalation-failure detection** | The counterfactual: a conversation that **met** an escalation condition and did not escalate. Runs online and post-hoc. **This is the 31% control.** |
| **P11-3** | **Turn-depth degradation** | Score quality by turn index and detect collapse — the observed "hallucinates objection responses after step four". |
| **P11-4** | **Loop-vs-escalate distinction** | v1 breaks loops. A broken loop with no hand-off is still a failed interaction. Loop termination must route to a human. |
| **P11-5** | **False-resolution detection** | Marked resolved while signals disagree — user repeats the question, closes negatively, or no confirmation was obtained. |
| **P11-6** | **Hand-off completeness** | The package must carry declared context: transcript, retrieved sources with tiers, decisions, attempted actions, abstentions. A hand-off without context is a second failure. |
| **P11-7** | **Ownership & SLA** | Every escalation has a named owner role, a deadline and a breach finding. Closes the v1 gap where findings never routed to a human. |

**Metric:** *missed-escalation rate* and *time-to-human* on escalated conversations.

---

## Pillar 12 — Policy Composition & Lifecycle

*Evidence: 2/11 built hierarchical policy by hand; Derrick quantifies **87% fewer misconfigurations**.*

Our policy model is **flat** — a list of documents with glob scope and "strongest effect wins". An
enterprise with 40 agents across 8 teams cannot manage flat policy, and the 87% figure is the tell:
flat policy *causes incidents*.

| ID | Requirement | Detail |
|---|---|---|
| **P12-1** | **Hierarchical policy** | Four levels: `org → team → agent → user`. Inheritance by default. |
| **P12-2** | **Override semantics** | A level may `extend`, `restrict` (narrow only), or `override` (requires explicit `overridable: true` upstream). Restriction is always allowed; loosening must be granted. |
| **P12-3** | **Effective-policy resolution** | For any subject, compute and *show* the resolved policy with per-rule provenance ("this rule came from team `finance`, overriding org default"). Opacity is the source of misconfiguration. |
| **P12-4** | **Policy lint** | Detect shadowed rules, unreachable rules, contradictory effects, over-broad globs, and levels that grant more than their parent. Runs in CI. |
| **P12-5** | **Context isolation** | A team's policy cannot read or leak another team's rules or scope (Derrick's "context isolation"). |
| **P12-6** | **Agent canary rollout** | Progressive rollout by agent *version* with health gates (error rate, verdict mix, latency, eval scores) and **automated rollback**. Distinct from policy observe→enforce. *(Siddhant, Derrick)* |
| **P12-7** | **Non-developer rule authoring** | A structured builder for the person who owns the rule — a QMS reviewer, a compliance lead — not the engineer. Compiles to the same policy documents. *(Leo)* |

## Pillar 13 — Failure Attribution ("a stack trace for agent systems")

*Evidence: Pranav's three-tier framework. The single sharpest articulation in the whole CV set — and unclaimed by LangSmith, Langfuse, or any vendor surveyed.*

We record execution paths. We do not **attribute**. When a five-agent workflow yields a wrong answer,
nobody — us, LangSmith, or Langfuse — can say which agent, which handoff, or which tool call caused it.

| ID | Requirement | Detail |
|---|---|---|
| **P13-1** | **Three evaluation tiers** | **Agent-level** (per-subagent correctness, tool-use validity) · **integration-level** (inter-agent handoff fidelity: was context lost, corrupted, or silently truncated?) · **end-to-end** (final output quality). *(Pranav)* |
| **P13-2** | **Handoff fidelity checks** | At each delegation: what was passed, what was dropped, what was paraphrased. Semantic drift across a handoff is a first-class defect. |
| **P13-3** | **Blame assignment** | Given a failed end-to-end outcome, walk the path backwards to the earliest step whose output was already wrong. This is the "stack trace". |
| **P13-4** | **Error-propagation detection** | *"A wrong decision at step 3 shapes context at step 4... by step 8, no individual step looks wrong in isolation."* Detect compounding error where no single step trips a threshold. |
| **P13-5** | **Turn-depth quality curve** | Score by step index; surface the collapse point. Complements P11-3. |
| **P13-6** | **Regression attribution** | When a suite regresses, attribute it to the agent/prompt/tool/model that changed. |

## Pillar 14 — Context & Retrieval Integrity

*Evidence: Rahul instrumented this in extreme detail; 73% of practitioners report agents fail on broken context rather than broken models.*

A whole failure family neither PRD had: **the agent answered badly because the document was chunked
badly.** Bad extraction → bad chunks → bad retrieval → confidently wrong answer. Every downstream
control we have is blind to it, including Pillar 8 — provenance tells you *which* source, not whether
the chunk was coherent.

| ID | Requirement | Detail |
|---|---|---|
| **P14-1** | **Ingestion quality gate** | Corruption detection per document *before* processing; extraction-confidence thresholds. *(Rahul: "GPT-based corruption detection gating each document")* |
| **P14-2** | **Chunk quality metrics** | Token distribution, **boundary coherence**, heading coverage, semantic density per chunk. *(Rahul, verbatim)* |
| **P14-3** | **Tokeniser/script compatibility** | Detect `[UNK]` boundary failures and script coverage gaps — a silent multilingual killer. *(Rahul: Cyrillic/Greek)* |
| **P14-4** | **Retrieval quality metrics** | nDCG@10, recall@k, MRR against ground-truth query sets, tracked over time. *(Rahul)* |
| **P14-5** | **Index freshness & coverage** | Staleness per index, documents indexed vs present, re-index lag. Feeds P7 (knowledge boundary) and P8 (source freshness) directly. |
| **P14-6** | **Context-budget governance** | Detect context-window pressure, "lost in the middle" risk, and truncation. Truncation that silently drops retrieved evidence is a correctness failure, not an efficiency one. |
| **P14-7** | **Memory-contamination detection** | Persisted memory containing a fact contradicted by a system of record — one bad write poisons every later session. |

## Pillar 15 — Cost, Reliability & Degradation

*Evidence: 5/11 built this by hand. Savings claimed: 60% infra, ~50%, $84K/yr, 75%, 70–80% token, 30%, 18%.*

This sits at the same inline position as enforcement — the same interception point, the same request
path. Building it separately would be duplicated plumbing.

| ID | Requirement | Detail |
|---|---|---|
| **P15-1** | **Circuit breaker** per provider/model with fail-fast on throttling. *(Aditya, Derrick)* |
| **P15-2** | **Fallback chain & degradation ladder** — graceful downgrade to a smaller/cheaper model rather than failing. *(Derrick: "sustaining 2x traffic spikes")* |
| **P15-3** | **TPM/RPM-aware rate limiting with hard daily token/spend caps.** *(Aditya, verbatim)* |
| **P15-4** | **Backpressure queueing** rather than dropping under load. *(Aditya: Redis backpressure)* |
| **P15-5** | **Cost attribution** per agent, team, user, session, tool — the unit finance actually budgets. |
| **P15-6** | **LiteLLM adapter** for routing/fallback where teams already run it. *(2/11)* |

---

# Part I-B — Integration surface

Not speculative. Frequency-ordered from the 11 CVs.

| ID | Integration | Freq | Requirement |
|---|---|---|---|
| **I-1** | **LangGraph** | **11/11** | Node/edge hooks, checkpointer-aware state, `interrupt()` for HITL approvals, per-node policy binding. **Non-negotiable — enforcement must be a LangGraph primitive.** |
| **I-2** | **MCP / FastMCP** | **9/11** | Inline governance of the tool call path, not only hygiene scanning (P1-5). Wrap FastMCP servers; govern `tools/call`. |
| **I-3** | **FastAPI** | 10/11 | Middleware + dependency for in-process enforcement. |
| **I-4** | **LangSmith** | **7/11** | Bidirectional: ingest runs, correlate our decisions to their trace ids, push scores/verdicts back as feedback. **We do not replace their traces.** |
| **I-5** | **OpenTelemetry** | 5/11 | ✅ built |
| **I-6** | **Langfuse** | 4/11 | Ingest traces; push scores and decisions back as observations. |
| **I-7** | **Prometheus/Grafana** | 4/11 | Metric export in their existing dashboards. |
| **I-8** | **RAGAS** | 3/11 | Scorer adapter. Reposition our scorers as complementary, not superior. |
| **I-9** | **LiteLLM** | 2/11 | Routing/fallback integration (P15-6). |
| **I-10** | **Ray** | 3/11 | Distributed agent execution — enforcement must work across Ray actors. |
| **I-11** | Azure OpenAI / Foundry · Bedrock · Vertex | 6/4/3 | Provider adapters beyond OpenAI/Anthropic. |
| **I-12** | Qdrant · Pinecone · pgvector · Azure AI Search · Elasticsearch | fragmented | Retrieval-scope enforcement (P10-2) needs per-store filter adapters. No winner exists — build the seam, not a favourite. |
| **I-13** | **Presidio · OPA** | 2/11 · 1/11 | ✅ built — and both independently chosen by these engineers, validating the picks. |
| **I-14** | **A2A** | 2/11 | Watch. Emerging at Fortune-500 scale; design Pillar 13 handoff checks to extend to it. |

---

# Part II — Platform hardening (Tier 0)

None of Part I ships without these. They are not features; they are the difference between a demo and something that can sit in a request path.

| ID | Requirement | Detail |
|---|---|---|
| **PL-1** | **Streaming (SSE) with inline enforcement** | **Verified defect: `stream: true` is silently ignored and a non-streaming body returned.** Two modes: (a) **buffered** — accumulate, enforce, release (simple, costs first-token latency); (b) **windowed** — stream through while running output detectors on a sliding window, terminating the stream with an error event on a block. Default buffered; windowed opt-in. Silently degrading a streaming client is never acceptable. |
| **PL-2** | **Database migrations** | Alembic. Today `create_all()` means a deployed instance cannot be upgraded. Every v2 model change ships with a migration and a tested downgrade. |
| **PL-3** | **Kill switch & quarantine** | Per-agent immediate stop, and quarantine (observe-only, all actions blocked). Reversible, audited, reachable from CLI, API and dashboard. Every serious competitor has this; we have nothing. |
| **PL-4** | **Agent-loop governance** | Govern the *multi-turn tool loop*, not just single calls: per-loop budgets, cumulative taint across iterations, depth limits, and cross-iteration composed-privilege detection (P9-9). |
| **PL-5** | **Async workers** | Evidence building, red-team campaigns, compliance computation and drift analysis move off the request path to a queue with retries and visible job status. |
| **PL-6** | **HA-ready persistence** | Postgres as the default (SQLite for local only), stateless gateway, connection pooling, and a documented, *tested* horizontal-scale story. Closes NFR-3. |
| **PL-7** | **Service-level fail-open** | v1 fails open per-detector. If the *control plane itself* is unreachable, the SDK and gateway must degrade to local-only enforcement and buffer telemetry rather than failing the customer's agent. |

---

# Part III — Cross-cutting design

## 3.1 Policy-language extensions

New `when` conditions, all evaluated by the existing `NativePolicyEngine` and compilable to Rego:

```yaml
when:
  # Pillar 7
  outside_knowledge_boundary: true
  question_type: [prediction, opinion]
  # Pillar 8
  source_tier_worse_than: system_of_record
  source_age_exceeds: 24h
  uncited_claims_above: 0
  sources_conflict: true
  # Pillar 9
  statement_operation: [DELETE, DROP, TRUNCATE, ALTER]
  unbounded_mutation: true
  affected_rows_above: 1000
  target_environment: [production]
  precondition_unverified: true
  duplicate_action: true
  # Pillar 10
  principal_entitlement: denied
  cross_tenant: true
  aggregate_group_below_k: 5
  purpose_mismatch: true
  # Pillar 11
  must_escalate: true
  escalation_missed: true
```

New effect: `abstain` (see §Pillar 7).

## 3.2 Data model additions

**Pillar 7:** `KnowledgeBoundary`, `AnswerabilityCheck`
**Pillar 8:** `Source` (tier, owner, freshness), `RetrievedChunk` (source_id, tier, age), `Claim` (text, bound_chunk_id, supported)
**Pillar 9:** `ActionAnalysis` (operation, targets, affected_rows, reversibility, environment, parse_status), `Precondition`, `IdempotencyKey`
**Pillar 10:** `Principal` (subject, groups, tenant, clearance), `EntitlementCheck`, `DisclosureFinding`
**Pillar 11:** `EscalationPolicy`, `EscalationEvent`, `HandoffPackage`
**Platform:** `Job` (async), `AgentControl` (kill/quarantine state)

Existing `Trace`, `Decision`, `DetectorRun` gain foreign keys to the above. `Decision` gains `principal_id` and `action_analysis_id`.

## 3.3 API additions

- `POST /v1/guard/query` — pre-flight answerability + entitlement, **before** retrieval
- `POST /v1/guard/retrieval` — filter/verify a retrieved chunk set for a principal
- `POST /v1/guard/statement` — analyse a generated artefact for blast radius
- `POST /v1/guard/answer` — citation binding + boundary verification post-flight
- `GET|PUT /api/agents/{slug}/knowledge-boundary`
- `GET|POST /api/sources` · `/api/sources/{id}/freshness`
- `POST /api/agents/{slug}/kill` · `/quarantine` · `/resume`
- `GET|PUT /api/agents/{slug}/escalation-policy`
- `GET /api/escalations` · `/api/escalations/{id}/handoff`
- `GET /api/jobs/{id}`
- Inline headers: `X-Nometria-End-User`, `X-Nometria-Purpose`

## 3.4 OSS decisions (Appendix A additions)

| Project | Licence | Health | Pillar | Verdict | Use | Exposure |
|---|---|---|---|---|---|---|
| **sqlglot** | **MIT** | Active, Tobiko Data | 9 | **REUSE ★** | SQL parsing to AST, 31 dialects, optimiser. **Zero dependencies** — preserves the offline/air-gap story. | **Low.** Behind an `ActionAnalyser` interface; a narrower native parser is the fallback. |
| **OpenFGA** | **Apache-2.0** | CNCF **incubating** | 10 | **REUSE ★** | Zanzibar ReBAC. `ListObjects` for retrieval pre-filtering, `Check` for post-filtering. | **Low.** Behind an `EntitlementEngine` interface; Cedar/SpiceDB are drop-in alternatives; a native ACL evaluator is the offline fallback. |

Both are permissive, neither is provider-owned, neither is archived — they pass the A.6 rule. `sqlglot`'s zero-dependency property is the deciding factor over `sqlparse`: it keeps `pip install nometria` light and the air-gap install intact.

**Removed from the critical path:** promptfoo (OpenAI-owned since 9 Mar 2026) — remains an optional adapter, marked `REFERENCE ⚠`, native runner is and stays the default.

## 3.5 New controls

18 controls in 5 families, mapped across the existing 7 frameworks:

| Family | Controls | Anchor mappings |
|---|---|---|
| `NOM-ANS` Answerability | 3 | EU AI Act Art. 13/15 · NIST MEASURE 2.3 · OWASP LLM09 |
| `NOM-PRV` Provenance | 4 | EU AI Act Art. 10/15 · ISO 42001 A.7 · OWASP LLM09 · SOC 2 CC7.2 |
| `NOM-ACT` Action assurance | 5 | EU AI Act Art. 14/15 · SOC 2 CC8.1 · OWASP LLM06 · Agentic T2/T3 · ATLAS AML.T0053 |
| `NOM-ENT` Entitlement | 4 | EU AI Act Art. 10 · GDPR Art. 5/32 · SOC 2 CC6.1/CC6.3/C1.1 · OWASP LLM02 |
| `NOM-ESC` Escalation | 2 | **EU AI Act Art. 14 (human oversight)** · NIST GOVERN 3.2 · Agentic T10 |

`NOM-ESC` is the strongest new compliance story: Art. 14 human oversight is currently evidenced only by our approval queue. "The system detects when a human *should have* been involved and was not" is a materially stronger claim.

---

## 4. Success metrics

| Pillar | Primary metric | Target |
|---|---|---|
| 7 | Unanswerable-question fabrication rate | **0** |
| 8 | Unauthoritative-answer rate | < 1% of material claims |
| 9 | Destructive-action false-negative rate | **0** (non-negotiable) |
| 10 | Entitlement-violating disclosure rate | **0**; over-permission ratio trending down |
| 11 | Missed-escalation rate | < 5% of conversations meeting a condition |
| Platform | Added p95 latency, buffered streaming | < 150 ms (100 ms + buffer) |

**Leading indicator that matters most:** *false-abstention rate* and *false-block rate*. Pillars 7 and 9 are the two most capable of making an agent useless. Both ship **observe-first**, like every v1 policy.

---

## 5. Test strategy

- **Labelled corpora per pillar.** Destructive-SQL corpus including evasion (`--` comments, stacked statements, tautological predicates, dialect quirks) with an **assert-zero-false-negatives** test. Answerability corpus of boundary-violating and boundary-satisfying questions. Entitlement fixtures with a deliberate permission-debt scenario.
- **Incident-replay tests.** Each named incident from [failure-modes.md](failure-modes.md) becomes a test: the 1.9M-row prod/staging confusion, the reconciliation hallucination, the HR acceptance email, the Copilot oversharing prompt. **If we cannot demonstrate interception of a real published incident, we have not built the control.**
- **Streaming conformance.** Byte-for-byte SSE equivalence versus a direct provider call when nothing fires; clean error-event termination when something does.
- **Migration tests.** Every migration applied and rolled back against seeded data.

---

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| V2-R1 | **Pillar 7 makes agents useless** — over-abstention is worse than the failure it prevents | Observe-first; false-abstention is a tracked metric with a finding; boundaries are per-agent and versioned; P7-6 explicitly detects over-refusal |
| V2-R2 | **Blast-radius estimation is wrong** and blocks legitimate work | Estimation is advisory unless `EXPLAIN` is available; policy defaults to escalate rather than block; dry-run (P9-10) gives the approver the plan |
| V2-R3 | **P10 requires the customer to have an entitlement model** — many do not | Post-filtering (P10-3) works with whatever ACLs exist; over-permission detection (P10-4) has value *even with no model at all* — it is the diagnostic that motivates the work |
| V2-R4 | **Streaming enforcement adds first-token latency** | Buffered default is honest about the trade; windowed mode for latency-sensitive deployments; both measured |
| V2-R5 | **Scope creep** — v2 is already large | Tier 1/2/3 explicitly deferred; no new architecture permitted; anything needing a new interface is a v3 candidate |
| V2-R6 | **sqlglot cannot parse a customer's dialect** | Fail closed with a clear finding, never fail open. An unparseable statement is an unauthorised one. |

---

## 7. Build sequence

Re-ordered after the practitioner evidence. The old order optimised for *severity*; this one
optimises for **whether anyone can adopt it**, which the CV data says is the binding constraint.

**Tranche 0 — be installable at all** *(nothing below matters without this)*
`PL-1` streaming · `PL-2` migrations · `PL-3` kill switch · **`I-1` LangGraph-native SDK**

> I-1 is promoted to Tranche 0. 11/11 use LangGraph. A governance product that is not a LangGraph
> primitive is a proxy they route around. This is the difference between "a tool we evaluated" and
> "a tool we installed".

**Tranche 1 — replace the hand-rolled wrapper** *(the six-of-eleven opportunity)*
`P12-1…P12-4` hierarchical policy + lint · `I-4/I-6` LangSmith + Langfuse correlation ·
`I-2` MCP inline governance · `P15-1…P15-4` circuit breaker, fallback, caps, backpressure

> This tranche is exactly what Aditya, Derrick, Leo, Jeremy, Siddhant and Rishabh built by hand.
> Shipping it means a platform team deletes code instead of writing it. That is the wedge.

**Tranche 2 — the controls nobody has**
`P9` action assurance (SQL blast radius, env binding, verified-state preconditions) ·
`P13` failure attribution ("a stack trace for agent systems") ·
`P7` answerability & abstention

> P13 is the strongest unclaimed capability in the entire evidence base — absent from LangSmith,
> Langfuse, and every vendor surveyed, and named unprompted by a practitioner as the thing that made
> multi-agent debugging tractable.

**Tranche 3 — depth**
`P10` entitlement · `P14` context & retrieval integrity · `P8` provenance · `P11` escalation ·
`P12-6/7` canary + non-developer authoring · `PL-4…PL-7`

**Deliberately not doing:** sandboxing, business-platform (Copilot/Power Platform) coverage,
network-level discovery. XL effort, defended by well-funded incumbents, and absent from the
practitioner evidence entirely — not one of 11 engineers mentioned needing them.

## 8. Traceability

Every requirement above extends [docs/traceability.md](traceability.md) on delivery, with the same discipline as v1: requirement → module → control → test. A requirement without a test that demonstrates the failure it prevents is not delivered.
