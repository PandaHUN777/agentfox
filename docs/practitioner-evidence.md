# Practitioner Evidence — 11 engineers, ~56 organisations, ~35 AI production contexts

**Primary evidence.** Eleven vetted senior/staff/principal AI engineers. Each has 3–10 employers; several carry multiple distinct projects per employer. The dataset is far larger than a headcount of eleven suggests.

> **Correction to a first pass of this analysis:** I initially described this as "six teams building six components." That was wrong by an order of magnitude. Counted properly there are **~56 distinct organisations**, of which **~35 are LLM/agent production contexts**, and the recurring components appear **6–16 times each**.

---

## 1. The organisational map

| Domain | Organisations represented |
|---|---|
| **Banking & capital markets** | Emirates NBD, Itaú Unibanco, ANZ Bank, SunTrust, Ally Financial, SMC Global Securities, Browmath Capital, Finlens/ZeFi (YC W20) |
| **Insurance** | Anthem, State Farm, Cigna, AGCS/Fireman's Fund, BCBSMN, Synechron, Envisso |
| **Healthcare** | Philips (CVIS + AIDA), Xcaliber Health, Cigna, Anthem |
| **Big tech / frontier** | Apple ×2, Google ×2, Meta, Amazon, Microsoft, Nvidia, Waymo ×3 |
| **Consulting / SI** | Deloitte UK AI CoE, Accenture, IBM (10 yrs), TCS, Ascendion, Turing |
| **Telecom** | Verizon, Nokia |
| **Retail / consumer / industrial** | Murphy USA, BSH Home Appliances, HP, Fynd/Shopsense, Oriontec (supermarket ERP), Dover, Motive |
| **Legal / contracts** | SpotDraft |
| **Developer tooling** | StackSpot AI, Apollo.io, Grey Chain, XTRA, Stybe, Vortigo, PasswordBoss |

**Regulatory surface actually touched:** HIPAA (×4), SOX-adjacent financial controls, FDA/QMS, NHS/NICOR cardiac registries, FHIR/HL7/EDI, HIPAA 5010 migration, Brazilian NF-e/SPED tax filing, AML/KYC, credit-risk and mortgage adjudication, SOC 2.

---

## 2. Stack convergence

| Technology | Adoption | Note |
|---|---|---|
| **LangGraph** | **11 / 11** | Not *a* framework — **the** framework, across every domain above |
| **FastAPI** | 11 / 11 | The agent-service default |
| **MCP / FastMCP / A2A** | 8 / 11 | Being **built**, not consumed. "Multi-MCP platform", "MCP to standardise data exchange between agents" |
| LangSmith or Langfuse | 7 / 11 | LangSmith 7, Langfuse 4 |
| OpenTelemetry | 5 / 11 | Rising |
| RAGAS | 3 / 11 | Only named eval library |
| **Knowledge graph / GraphRAG** | 3 / 11 | All three the most senior, in the hardest domains |
| Ray | 3 / 11 | Distributed agent execution |
| **Open Policy Agent** | 1 / 11 | Only one reached for a real policy engine |
| Temporal | 1 / 11 | Durable execution |

**Implication: integration must be LangGraph-native first.** An OpenAI-compatible proxy is table stakes; what matters is dropping into an existing `StateGraph`. Nothing in our PRD prioritises this.

---

## 3. The core finding, counted properly

Not one of these engineers bought an AI-governance product. **Every recurring component was hand-built, repeatedly, across independent organisations.**

| Component | Contexts | Where |
|---|---|---|
| **Evaluation harness** | **16** | SpotDraft, Apollo.io, Nvidia, Amazon, Xcaliber, BSH, Itaú, Dover, Deloitte UK, Grey Chain, Sankalp, Accenture, Waymo, Murphy USA, Apple ×2 |
| **Resilience & cost control** | **13** | Grey Chain, Deloitte UK, Murphy USA, Apple, SpotDraft, Apollo.io, Browmath, fin-ops platform, Dover, Itaú, Emirates NBD, BSH, HP |
| **Audit & traceability** | **9** | Emirates NBD, Philips, Murphy USA, Apple ×2, Anthem, fin-ops platform, Cigna, Ally |
| **Tool policy / permissions / RBAC** | **8** | Murphy USA, Apple ×2, Accenture, Philips, Anthem, Deloitte UK, Dover |
| **HITL / approval workflow** | **8** | Murphy USA, Emirates NBD ×2, Philips, fin-ops platform, Anthem, Apple, Deloitte UK |
| **Guardrails (PII / injection / safety)** | **6** | Deloitte UK, Murphy USA, Apple, Accenture, Anthem, Apple |

**Sixteen independent teams built an evaluation harness. Thirteen built cost and resilience control. Nine built an audit trail.** This is not a niche gap — it is a missing platform layer that the industry is paying for over and over in engineer-months.

### The two verbatim quotes that matter most

**Anthem, healthcare claims** — this is our Pillar 5 trace model, hand-built at a health insurer:

> *"Implemented **auditable AI workflow patterns to capture agent actions, prompts, tool calls, retrieved context, model responses, and decision paths**, improving traceability and governance across healthcare AI processes."*
>
> *"Designed **HIPAA-aware Agentic AI architectures** … incorporating secure data access, role-based access controls (RBAC), audit logging, traceability, and **human-in-the-loop validation for sensitive AI-driven decisions**."*

**Murphy USA, fuel retail** — this is our Pillars 2, 3 and 11, hand-built at a petrol-station chain:

> *"Hierarchical policy framework (company → team → user) with inheritance/override rules, context isolation, and tool permissions enforced via a policy engine integrated into LangGraph, **reducing policy misconfigurations by 87%**."*
>
> *"Defined reusable, versioned agent tools and SDKs … **standardized tool schemas, semantic versioning, and automatic compatibility checks via CI**."*

---

## 4. The prior art nobody in this market cites: BPM

The most experienced person in the dataset — 20 years, now Principal Agentic AI Architect at Apple — spent a decade before this building **Pega/PRPC** systems:

| Client | Year | What was built |
|---|---|---|
| Cigna | 2020–21 | Product Management Tool — benefit-product configuration via a Recommendation Engine |
| State Farm | 2019–20 | Life Guided Processing System — loans, withdrawals, policy changes; **rules + workflow automation + document generation** |
| AGCS / Fireman's Fund | 2016–19 | BPM workflow integration post-acquisition; **policy transactions and operations work routing** |
| SunTrust Bank | 2014–16 | Five Pega applications upgraded; **declarative rules** |
| American Express | 2012–14 | Fraud Case Initiation & Acceptance — case-setup automation |
| BCBSMN | 2011–12 | HIPAA 5010 compliance migration |

**This is the missing frame for the whole category.** Enterprise BPM already solved: declarative rules, case lifecycle, work routing, SLA enforcement, maker-checker, four-eyes approval, audit trail, versioned rule sets, business-user rule authoring.

**An enterprise agent is a BPM case with a stochastic executor.** Every "novel" requirement in our PRD — policy-as-code, approval chains, audit trails, contracts, self-service rule authoring — has a mature analogue in Pega and Appian. The AI-governance market has reinvented a subset of it, badly, without referencing the prior art.

And note **who** is building enterprise agents: the same people who built Pega workflows. They will expect case lifecycle, work queues, SLA and maker-checker — and they will find none of it.

**Actionable:** the "contract" idea from our infrastructure analysis is not novel. It is **declarative business rules for a non-deterministic actor.** That is a much stronger, more legible pitch to an enterprise buyer than "AI guardrails" — and it comes with 20 years of buyer familiarity.

---

## 5. Why 16 teams built evals despite LangSmith and Langfuse existing

7 of 11 already run LangSmith or Langfuse. **Sixteen contexts still built a custom evaluation harness.** They are complements, not substitutes — and the reason is precise:

| What they built | Why the tool didn't do it |
|---|---|
| *"Three-tier: agent-level, integration (**inter-agent handoffs**), end-to-end"* + *"structured execution traces enabling precise failure attribution — **a stack trace for agent systems**"* | Generic eval scores an output. This scores a **structure** |
| *"JSON-schema-enforced outputs, **hybrid rule-based + model-assisted verification**"* → 50% less rework | Needs deterministic contract checking, not a judge |
| *"50-thread parallel LLM/VLM evaluation harness with **deterministic runtime**"* | Throughput and reproducibility at production scale |
| *"Chunking metrics: **token distribution, boundary coherence, heading coverage, semantic density**"* + nDCG@10 / recall@k / MRR | Nobody evaluates the **ingestion pipeline** |
| *"**SLM-powered** evaluation framework benchmarking agent reasoning, **tool-use correctness**, workflow completion"* | Tool-use correctness is agent-specific |
| *"A/B testing and experimentation frameworks for ML models **and LLM prompts/workflows**"* | Experimentation across prompt *and* graph versions |

**The gap is agent-structure-aware evaluation.** Everything on the market evaluates a request/response pair. These teams needed to evaluate a **graph**: which subagent, which handoff, which tool call, which step in a trajectory.

---

## 6. The architecture pattern six teams converged on — and nobody sells

> **Deterministic rules first, model-based semantics second.**

| Context | Their words |
|---|---|
| Philips (QMS) | *"Hybrid validation framework combining **deterministic rule-based checks** with AI-powered semantic analysis across 20+ document types"* |
| Nvidia (via Turing) | *"JSON-schema-enforced outputs, **hybrid rule-based + model-assisted verification**"* |
| Emirates NBD (AML) | *"**Deterministic statistical profiling** to detect behavioral anomalies"* + *"**controlled** RAG pipeline"* |
| HP | *"Hybrid log classification integrating **Regex**, Sentence Transformers + Logistic Regression, **and LLMs**"* |
| Anthem (claims) | *"Applied **rule-based + statistical models** to optimize adjudication and reduce manual review"* |
| Deloitte UK | Presidio (deterministic) → hallucination cross-reference → content filter |

**Six of eleven, independently.** Our detector pipeline already works this way — heuristic fast path before any model-based detector — and we never named it. It should be the headline architecture claim, not an implementation detail.

Note also *"**zero false positives**"* stated as a headline achievement (OWASP LLM, 29/29). That corroborates the guardrail-tuning research from someone who had to earn it.

---

## 7. Gaps the resumes reveal that no vendor report did

### 7.1 "A stack trace for agent systems"
The best phrase in the dataset. Three-tier evals with *"structured execution traces enabling **precise failure attribution**"* — the error-propagation problem, **named and solved by a practitioner because nothing did it.** Failure attribution across a multi-agent trajectory is the highest-signal unbuilt feature here. We have the trace data; we have no attribution.

### 7.2 Approvals run for days, not minutes
*"Durable agent execution with LangGraph persistence and human-in-the-loop patterns for **multi-day approval processes**."* Corroborated by underwriter review (Emirates NBD), QMS reviewers (Philips), and claims adjudication (Anthem).

**Our approval design uses a 30-minute TTL with deny-on-timeout. That is a design defect.** Real enterprise approval is asynchronous, spans days, survives restarts — the Pega work-queue pattern, again.

### 7.3 Agent release engineering, invented ad hoc in three places
- Xcaliber Health: *"versioned deployments, **canary rollouts, automated rollback triggers, post-release health gates**"* — zero-downtime agent updates
- Murphy USA: *"versioned agent tool registries … **semantic versioning and automatic compatibility checks via CI**"*, canary upgrades across regions
- Philips: automated test suites *"enforced as **merge and release gates**"*

Our CI gate scores a suite and fails a build. They need **tool/agent version compatibility matrices, canary with health gates, and automated rollback.**

### 7.4 Ingestion quality gating
BSH, 26 languages across five script groups: *"**GPT-based corruption detection gating each document before processing**"*; chunk-quality metrics; RAGAS on **live production query-response pairs**; and a concrete failure — **`[UNK]` token boundary failures on Cyrillic and Greek** forcing a change of both embedding model and extraction layer.

**Nobody governs the ingestion pipeline**, and it is upstream of every grounding and citation failure.

### 7.5 Business-user rule authoring
Philips: *"Refactored a rigid validation flow into a **configurable validation engine** supporting 15+ QMS document types, **allowing users to define custom validation rules without developer intervention**."*

Again the BPM pattern — the business analyst authors the rule. Arrived at independently from the eval-tooling complaint that *"open-source tools don't handle the organizational layer."*

---

## 8. What is absent across all 11 — and what it means

| Absent | Count |
|---|---|
| **EU AI Act, ISO 42001, NIST AI RMF** | **0 / 11** |
| **Any AI-governance vendor** (Credo AI, Zenity, Arthur, Lakera, OneTrust…) | **0 / 11** |
| **Tamper-evident** audit (audit *logging* appears 9×; tamper-evidence never) | **0 / 11** |
| **Segregation of duties** for agents | **0 / 11** |
| **End-user entitlement propagation** into retrieval | 1 / 11 |

Domain compliance is *everywhere* — HIPAA, FDA/QMS, NHS/NICOR, SOC 2, HIPAA 5010, AML/KYC, NF-e/SPED, *"regulator-grade auditability"*. **AI-specific frameworks appear nowhere.**

**The correct reading: two buyers who do not talk.**

- The **engineer** builds policy, guardrails, evals, HITL, audit and cost control *because they cannot ship without them*. Acute, present-tense, and served by **no vendor** — so they rebuild it at every company. Sixteen times for evals alone.
- The **CISO/GRC buyer** wants framework mapping and evidence. Real, but it arrives at procurement.

Our PRD asserts bottom-up land-and-expand. **We built top-down** — 36 controls and 257 mappings first, the engineer's six components thinly. The evidence says the sequencing is inverted.

**Compliance is not the wedge. It is what lets the wedge survive procurement.**

---

## 9. Cost is a first-class engineering concern

Thirteen contexts. Six people put it in headline bullets:

*"70–80% token cost reduction and 3–5× performance gains"* · *"hard daily caps on token spend"* with TPM/RPM-aware limiting · *"eliminated $84K/yr"* via self-hosted serving · *"75% cost optimization"* · *"~50% application and infra cost reduction"* · *"intelligent model routing and caching"*.

Our PRD files FinOps under **Tier-3 competitive drag.** For the person who would champion this internally it is a **primary, measured, promotion-worthy** concern — and *"hard daily caps on token spend"* is simultaneously a governance control and a budget control. It is the cheapest route into a CFO conversation.

---

## 10. Where knowledge graphs actually appear

Three of eleven — **all three the most senior, in the hardest domains**: knowledge-graph-augmented RAG over contract repositories and regulatory databases (legal); GraphRAG for *"multi-hop reasoning and complex enterprise queries"* (Fortune 500); Graph RAG in an enterprise AI platform (Accenture).

Confirms the infrastructure research: knowledge graphs are what you reach for **after vector RAG has already failed** on entity disambiguation and multi-hop — and that arrives with complexity and regulatory stakes, not with scale.

**Do not build graph features early.** Build the entity/provenance **contract** a graph would consume, so teams that already have one can plug in.

---

## 11. Revised priorities on this evidence

| # | Build | Evidence | Effort |
|---|---|---|---|
| **1** | **LangGraph-native integration** + Langfuse/LangSmith ingestion | 11/11 LangGraph; 7/11 already instrumented | **S** |
| **2** | **Trajectory failure attribution** — "a stack trace for agent systems" | Named and hand-built; 16 contexts built custom eval because tools score outputs, not structures | **M** |
| **3** | **Durable long-running approvals** — days, restart-safe, work-queue semantics | 8 contexts; underwriters, QMS reviewers, claims adjudicators | **M** |
| **4** | **Budget & rate governance** — TPM/RPM, hard daily spend caps, per-agent/team attribution | 13 contexts | **S** |
| **5** | **Tool contract + registry**, semantic versioning, CI compatibility checks | Hand-built at Murphy USA; the BPM rule-set pattern | **S–M** |
| **6** | **Guardrail operations** — FP tuning, per-detector latency attribution, cumulative budget | *"Zero false positives"* as a headline achievement | **S–M** |
| **7** | **Agent release engineering** — canary, health gates, rollback, compatibility matrix | 3 contexts independently | **M** |
| **8** | **Ingestion quality gating** — corruption detection, chunk metrics, retrieval metrics | Hand-built at BSH; upstream of everything | **M** |
| **9** | **Business-user rule authoring** | Philips; the BPM analyst pattern | **M** |
| 10 | Compliance catalog, evidence packages | **Already built** — keep as the procurement layer | done |

---

## 12. Strategic conclusion

**The need is unambiguous.** ~35 independent AI production contexts across banking, insurance, healthcare, telecom, legal, retail, autonomous driving and big tech. Zero bought a governance product. All rebuilt overlapping pieces of the same platform — evals sixteen times, cost control thirteen, audit nine.

**Three corrections to our strategy:**

1. **Lead with the engineer's components**, LangGraph-native, alongside the observability they already run. Keep compliance as the procurement unlock, not the pitch.
2. **Adopt the BPM frame.** *Declarative rules and case lifecycle for a stochastic executor* is more legible to an enterprise buyer than "AI guardrails", carries 20 years of familiarity, and is what the people building these systems already know. It also supplies the missing patterns — work queues, SLA, maker-checker, four-eyes, versioned rule sets, business-user authoring.
3. **Fix the approval design** and **promote cost control** out of Tier 3.

---

### Method note

Eleven CVs read in full, including sections truncated on a first pass. Organisation count includes distinct employers, distinct named client engagements, and distinct named projects within an employer. Counts are of explicit mentions; absence from a CV is weak evidence of non-use. **This is a self-selected, highly-vetted, currently-on-market sample**, biased toward strong Python/LangGraph engineers at organisations that can afford them; it under-represents low-code, Copilot Studio and vendor-platform deployments. Treat **convergence** signals as strong and **absence** signals as suggestive.
