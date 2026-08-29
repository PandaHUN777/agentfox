# Practitioner Signal — evidence from 11 senior AI engineers

**Source:** full CVs of 11 vetted senior/staff/principal AI engineers, 2026. Combined ~100 years of engineering, ~40 years specifically on production LLM/agent systems. Employers include **Meta, Apple, Waymo, Accenture, Deloitte UK AI CoE, Philips Healthcare, Emirates NBD, Itaú Unibanco, HP, Nvidia (via Turing), Amazon (via Turing), SpotDraft, Apollo.io, Murphy USA, Cigna, Ally Financial, BSH, Nokia, Motorola, Samsung**.

This is the strongest evidence we have, because it is not a vendor survey. It is a record of **what senior engineers were actually paid to build**, in production, in regulated enterprises, over the last three years.

**It changes the thesis.** Details below, but the headline: *six of eleven independently hand-built the same governance layer we are trying to sell.* They did not buy one. That is the market signal.

---

## 1. The technology graph

Frequency across 11 CVs. Anything at 7+/11 is effectively a standard.

### Orchestration — settled
| Tech | Count | Note |
|---|---|---|
| **LangGraph** | **11/11** | Universal. Every single engineer. Not "a" framework — *the* framework. |
| LangChain | 10/11 | Usually alongside LangGraph |
| **MCP / FastMCP** | **9/11** | Effectively standard for tool exposure |
| FastAPI | 10/11 | Universal serving layer |
| Kubernetes + Docker | 10/11 | Universal deployment |
| LlamaIndex | 3/11 | Secondary |
| Ray | 3/11 | Distributed agent execution (Xcaliber, Waymo, Accenture) |
| **A2A** | 2/11 | Emerging — both at Fortune-500 scale (Accenture, Fortune 500 architect) |
| Autogen | 1/11 | Rare |
| Google ADK / Bedrock AgentCore / Strands / MS Foundry Agent Service | 2/11 | Cloud-native agent runtimes, at the platform-architect tier |

### Observability & evaluation — LangSmith dominant, nobody has enough
| Tech | Count |
|---|---|
| **LangSmith** | **7/11** |
| OpenTelemetry | 5/11 |
| **Langfuse** | **4/11** |
| Prometheus / Grafana | 4/11 |
| RAGAS | 3/11 |
| MLflow | 2/11 |
| Datadog / New Relic / Sentry | 2/11 |

**Several use two or three simultaneously** (LangSmith *and* Langfuse *and* OTel *and* Prometheus). That is not preference — that is **none of them covering the whole need**.

### Retrieval — completely fragmented
Pinecone (2), Qdrant (2), FAISS (3), Azure AI Search (2), Redis Vector (1), pgvector (1), Elasticsearch (1), OpenSearch (1), Weaviate (1), Bedrock Knowledge Bases (1), MongoDB vector (1).

**No winner.** Hybrid retrieval (BM25/BM42 + dense) with reranking appears in 4/11 as the default architecture. **Knowledge graph / GraphRAG appears in 3/11** — and always at the hardest problems (legal multi-hop over contracts, enterprise multi-hop reasoning, Waymo/Accenture platforms).

### Cloud & model access
Azure OpenAI / AI Foundry 6/11 · AWS Bedrock 4/11 · Vertex/Gemini 3/11 · direct OpenAI 8/11 · Anthropic 5/11 · LiteLLM routing 2/11.

**Almost everyone is multi-provider.** Vendor neutrality (our X-2) is validated by the data.

### Domains — regulated-heavy
Banking/fintech **3** (Emirates NBD, Itaú, Finlens/Browmath) · Healthcare **3** (Philips, Cigna, Xcaliber) · Legal **2** (SpotDraft CLM, Deloitte) · Retail/CPG **2** (Murphy USA, BSH) · Consulting **2** (Accenture, Deloitte) · plus recruiting, sales, devtools, autonomous driving, telecom.

---

## 2. The finding that matters most

**6 of 11 independently hand-built a governance / guardrail / validation layer.** Not adopted. *Built.*

| Engineer | What they built by hand | Employer context |
|---|---|---|
| **Aditya** | "**Four-layer AI safety guardrail** wrapping LangGraph agents — Presidio PII (12 entity types), hallucination detection cross-referenced against Azure AI Search, Content Filter + Prompt Shields; **Grade A on OWASP LLM prompt-defense (29/29 tests, zero false positives)**" | Deloitte UK AI CoE |
| **Derrick** | "**Hierarchical policy framework (company → team → user) with inheritance/override rules**, context isolation, and tool permissions enforced via a policy engine integrated into LangGraph workflows — **reducing policy misconfigurations by 87%**"; plus PII/PHI detection, injection mitigation, redaction, audit logging via OPA + FastAPI runtime hooks | Murphy USA (13 yrs incl. Apple, Cigna, Ally) |
| **Leo** | "Refactored a rigid validation flow into a **configurable validation engine**, supporting 15+ QMS document types and **allowing users to define custom validation rules without developer intervention**"; "**hybrid validation framework** combining deterministic rule-based checks with AI-powered semantic analysis across 20+ document types" | Philips Healthcare (FDA/QMS/FHIR) |
| **Jeremy** | "Secure AI governance frameworks with AI safety guardrails, **hierarchical policies, Policy-as-Code**, RBAC, PII/PHI detection, sensitive data protection, and compliance controls" | Accenture (prev. Waymo) |
| **Siddhant** | "**JSON-Schema Constraints, Hybrid Rule-Based + Model-Assisted Verification**"; SLM-powered evaluation framework for reasoning accuracy, tool-use correctness, workflow completion | Xcaliber Health (prev. Nvidia/Amazon via Turing) |
| **Rishabh** | "**Human-in-the-loop decisions with regulator-grade auditability and traceability**"; deterministic statistical profiling + controlled RAG for AML | Emirates NBD |

**Read that list again.** Six senior engineers, six different companies, four industries, three continents — all building the same component. Independently. Because nothing off-the-shelf fit.

**That is the market.** Not "enterprises need governance" (a vendor claim). But "**enterprises are already paying senior engineers to build governance, one company at a time, and getting an inconsistent result**" (an observed fact).

It also explains the competitive picture: they are not choosing between us and Zenity. They are choosing between us and **two engineer-quarters of internal work**.

---

## 3. What they built that we do NOT have

Concrete, evidenced, and absent from both PRDs.

### 3.1 Hierarchical policy with inheritance and override — 2/11, quantified
> Derrick: *"hierarchical policy framework (**company → team → user**) with **inheritance/override rules**, context isolation, and tool permissions... **reducing policy misconfigurations by 87%** and enabling **tenant-level overrides**"*
> Jeremy: *"**hierarchical policies**, Policy-as-Code"*

Our policy model is **flat** — a list of documents with glob scope matching and "strongest effect wins". No inheritance, no override semantics, no org→team→agent→user hierarchy.

This is not a nice-to-have. An enterprise with 40 agents across 8 teams *cannot* manage flat policy. The 87% misconfiguration reduction is the tell: flat policy **causes incidents**.

### 3.2 Versioned tool registry with CI compatibility checks — 1/11, quantified
> Derrick: *"**reusable, versioned agent tools and SDKs**... standardized **tool schemas, semantic versioning, and automatic compatibility checks via CI** to accelerate safe agent development and **reduce integration time by 60%**"*

We have a `Tool` row with a schema blob. No versions, no compatibility checking, no CI gate. Meanwhile we *do* detect MCP schema drift — we notice the problem and offer no mechanism to manage it.

### 3.3 Failure attribution across multi-agent handoffs — 1/11, and it is the sharpest articulation in the whole set
> Pranav: *"a **three-tier agentic evaluation framework** spanning **agent-level** evals (per-subagent correctness and tool use), **integration** evals (inter-agent handoffs), and **end-to-end** evals (final output quality), with structured execution traces enabling **precise failure attribution (a stack trace for agent systems)** and automated regression detection across releases"*

**"A stack trace for agent systems."** That is the product line in the whole document.

We record execution paths. We do not *attribute*. When a 5-agent workflow yields a wrong answer, we cannot say which agent, which handoff, which tool call caused it. Neither can LangSmith. This is the single most valuable unclaimed capability found in the evidence.

### 3.4 Ingestion & chunking quality as a governed surface — 1/11, in extreme detail
> Rahul: *"Instrumented **chunking and retrieval quality** across the full pipeline using **chunking metrics covering token distribution, boundary coherence, heading coverage, and semantic density per chunk**, combined with **retrieval metrics nDCG@10, recall@k, MRR** measured against ground-truth query sets"*
> and: *"replacing all-MiniLM-L6-v2 with BAAI/bge-m3... **eliminating [UNK] token boundary failures on Cyrillic and Greek scripts**"*
> and: *"**GPT-based corruption detection gating each document before processing**"*

This is a whole failure family neither PRD has: **the agent answered badly because the document was chunked badly.** Bad extraction → bad chunks → bad retrieval → confidently wrong answer. Every downstream control we have is blind to it.

Rahul also prototyped **"vectorless RAG"** — Azure Document Intelligence structured JSON tree, two LLM calls at query time, *zero* indexing cost, 309 languages. A signal that the "embed everything" default is being questioned by practitioners.

### 3.5 Cost & reliability control as first-class engineering — 5/11
> Aditya: *"circuit breaker for LLM provider outages, **Redis-backpressure request queuing**, provider fallback, and **TPM/RPM-aware rate limiting with hard daily caps on token spend**"*
> Derrick: *"graceful degradation to **smaller LLMs**, sustaining 2x traffic spikes"*
> Pranav: *"multi-model orchestration & routing layer (LiteLLM)... for cost/latency/accuracy optimisation with **production fallbacks**"*

Quantified savings across the set: 60% infra (Deepak), ~50% (Luis), $84K/yr (Pranav), 75% (Rishabh), 70–80% token (Deepak), 30% (Rahul), 18% (Derrick).

We have a `Budget` table that counts. No circuit breaker, no fallback chain, no backpressure, no degradation ladder. **Cost control is where these engineers spend real time, and it is adjacent to enforcement — the same inline position.**

### 3.6 Progressive rollout for agents — 2/11
> Siddhant: *"**canary rollouts, automated rollback triggers, and post-release health gates** — achieving zero-downtime releases across all iterative agent updates"*
> Derrick: *"**canary upgrades across regions**"*

We have observe → enforce for *policy*. We have nothing for *agent version* rollout, health gates, or automated rollback.

### 3.7 Non-developer rule authoring — 1/11, and it solves a problem we flagged
> Leo: *"allowing **users to define custom validation rules without developer intervention**"*

Our YAML policies are better than code but still developer-facing. The guardrail-tuning problem ("without violation specificity, tuning becomes guesswork") is *organisational* — the person who knows the rule is a QMS reviewer or a compliance lead, not the engineer.

### 3.8 Multi-tenancy + RBAC, hand-built — 3/11
Leo, Derrick, Jeremy all built it themselves. Confirms the gap-analysis Tier-1 item is real, not theoretical.

---

## 4. What this says about our positioning

### 4.1 We are competing with `git init`, not with Zenity

The buyer is not choosing between vendors. **Six of eleven chose to build.** Whatever we ship must beat *two engineer-quarters of internal work* on day one — which means it must be:

- **`pip install`-able and useful in an afternoon**, not a platform procurement
- **Composable with LangGraph**, because that is 11/11
- **Wired to LangSmith/Langfuse**, because that is 7/11 and 4/11 — we are *not* replacing their traces

### 4.2 The integration surface is now concrete, not speculative

Evidenced from the CVs, in priority order by frequency:

| Integration | Freq | Why |
|---|---|---|
| **LangGraph** — node/edge hooks, checkpointer, interrupt for HITL | 11/11 | Non-negotiable. Enforcement must be a LangGraph primitive. |
| **MCP / FastMCP** — inline governance of tool traffic | 9/11 | We only scan hygiene today; must govern the call path |
| **FastAPI** — middleware/dependency | 10/11 | Native serving integration |
| **LangSmith** — trace correlation, run ingestion | 7/11 | Correlate decisions to *their* traces |
| **OpenTelemetry** | 5/11 | Already built |
| **Langfuse** — bidirectional | 4/11 | Ingest traces, push scores/decisions back |
| **RAGAS** — scorer adapter | 3/11 | Their eval vocabulary |
| **Presidio** | 2/11 explicit | Already built |
| **OPA** | 1/11 explicit | Already built — and Derrick independently chose it, validating the pick |
| **LiteLLM** — routing/fallback | 2/11 | Cost + failover layer |
| **Prometheus/Grafana** — metric export | 4/11 | They already have dashboards |
| Azure OpenAI / Bedrock / Vertex | 6/4/3 | Provider adapters |
| Qdrant / Pinecone / pgvector / Azure AI Search | fragmented | Retrieval-scope enforcement needs per-store adapters |
| **Ray** | 3/11 | Distributed agent execution at the top tier |
| **A2A** | 2/11 | Watch — emerging at Fortune-500 scale |

### 4.3 Where I was wrong

Correcting the record from earlier documents:

| Earlier claim | Evidence says |
|---|---|
| "Silent-failure detection — nobody does this" | **Wrong.** Aditya built hallucination detection cross-referenced against Azure AI Search. Rahul runs RAGAS faithfulness/relevance/precision/recall on live production pairs. Cleanlab/Vectara/Galileo productise it. We are *behind*, not ahead — our groundedness is lexical, theirs is model-based. |
| "Tamper-evident audit is a differentiator" | **Overstated.** Rishabh built "regulator-grade auditability" without a hash chain and it satisfied a bank. Auditability is required; *cryptographic* auditability was asked for by nobody in 11 CVs. Keep it — it is cheap and true — but stop leading with it. |
| "Governance camp lacks runtime enforcement" | **Weakening.** Derrick and Jeremy both built runtime policy enforcement inside enterprises. The capability is not rare; the *packaging* is. |
| "Escalation breakdown is 31% and nobody addresses it" | **Half right.** Rishabh and Derrick both built HITL escalation with audit trails. The *detection of missed escalation* still appears nowhere. Narrow the claim to that. |

### 4.4 Where the evidence *strengthens* our position

- **Vendor neutrality** — nearly all are multi-provider and multi-cloud. Confirmed.
- **Self-host / in-boundary** — Deloitte inside a Citrix-restricted environment; Philips FDA/QMS; Emirates NBD. Confirmed.
- **OPA as the policy engine** — Derrick chose it independently. Confirmed.
- **Presidio for PII** — Aditya chose it independently (12 entity types). Confirmed.
- **Observe-before-enforce** — Derrick's 87% misconfiguration reduction is the same insight from the other side.

---

## 5. What enterprises are actually trying to build

From the project descriptions, the recurring shapes:

1. **Regulated document intelligence with validation** — Philips (QMS/FDA, 20+ doc types), SpotDraft (contract review), Deloitte (governance dashboards). *Pattern: extract → validate against rules → traceability → human review.*
2. **Agentic financial operations** — Emirates NBD (fleet loan automation: document processing, KYC, valuation, risk scoring; AML alert investigation), Deepak (financial ops platform with multi-day approval). *Pattern: multi-agent + external API integration + HITL + regulator-grade audit.*
3. **Enterprise knowledge assistants over fragmented sources** — BSH (26 languages, appliance manuals), StackSpot (private repos + API specs + internal docs), Accenture (5+ retrieval technologies). *Pattern: heterogeneous ingestion, multilingual, hybrid retrieval, citation.*
4. **Internal AI platform teams** — Accenture, Waymo, Apollo.io, Xcaliber, Murphy USA. *Pattern: build reusable platform services so application teams can ship agents safely.*

**Shape 4 is our real buyer.** The platform team that has been told "make it safe for 20 product teams to ship agents" — and is currently writing Derrick's hierarchical policy framework from scratch.

---

## 6. Recommended changes to PRD v2

| # | Change | Evidence | Effort |
|---|---|---|---|
| **C1** | **Hierarchical policy** (org → team → agent → user) with inheritance/override, and a `policy lint` for misconfiguration | Derrick (87%), Jeremy | M |
| **C2** | **LangGraph-native integration** — node hooks, checkpointer-aware, `interrupt()` for HITL | 11/11 | M |
| **C3** | **Failure attribution** — per-agent, per-handoff, end-to-end tiers; "stack trace for agent systems" | Pranav | L |
| **C4** | **MCP inline governance** (not just hygiene scanning) | 9/11 | M |
| **C5** | **LangSmith + Langfuse bidirectional integration** — ingest traces, push decisions/scores back | 7/11 + 4/11 | M |
| **C6** | **Versioned tool registry** with semver + CI compatibility gate | Derrick (60%) | M |
| **C7** | **Ingestion & chunking quality** as a governed surface — chunk metrics, retrieval metrics, corruption gating | Rahul | L |
| **C8** | **Cost & reliability controls** — circuit breaker, provider fallback, degradation ladder, hard token caps, backpressure | 5/11 | M |
| **C9** | **Agent canary rollout** with health gates and automated rollback | Siddhant, Derrick | M |
| **C10** | **Non-developer rule authoring** surface | Leo | M |
| **C11** | **RAGAS scorer adapter**; reposition our scorers as complementary, not superior | 3/11 | S |
| **C12** | **Reposition: SDK-first.** The unit of adoption is a `pip install` that replaces a hand-rolled wrapper, not a platform purchase. | 6/11 built it themselves | — |

**C12 is the strategic one.** Everything else is a feature. C12 changes what we are.

---

## Appendix — CVs analysed

Aditya Pratap Singh (Deloitte UK AI CoE) · Deepak Aggarwal (Meta, Finlens YC W20, Browmath) · Leonardo Silva (Philips Healthcare, Stone) · Luis Miguel Rojas Aguilera (Dover, Itaú Unibanco, StackSpot, Motorola, Samsung) · Pranav Pandey (SpotDraft, Apollo.io, Motive) · Rahul Yadav (BSH, HP, Nokia) · Rishabh Porwal (Emirates NBD, Synechron) · Siddhant Vajpai (Xcaliber Health, Turing→Amazon/Nvidia) · Derrick Crawford (Murphy USA, Apple, Cigna, Ally Financial) · Jeremy (Jier) M Chen (Accenture, Waymo) · Samirkumar Himatlal Gohel (Fortune 500 AI architecture).
