# Where Enterprise Agent Infrastructure Actually Breaks

**A business-first analysis.** Not about our product — about what companies are building, why it fails, and what structurally has to exist. Product implications are confined to the last section deliberately.

---

## 1. The reframe

Every failure analysis in this market treats the agent as the unit of analysis: bad prompt, weak model, missing guardrail. That framing is wrong, and the data says so — **73% of leaders report agents fail more often from broken context than from broken models.**

The better frame:

> **Enterprises are deploying agents onto infrastructure built for humans — where the missing knowledge lived in people's heads.**

A new analyst joining a finance team doesn't know which of seven tables called `revenue` is the real one. They ask someone. Within a month they've absorbed a hundred pieces of tacit knowledge: this dashboard is deprecated, that field means something different after the 2023 migration, never run that job before month-end close, ask Priya before touching the ledger.

**An agent has no colleague.** Every one of those facts is absent from the machine-readable layer, so the agent guesses — fluently, confidently, and at scale.

This explains failures that look unrelated:

| Symptom | Missing knowledge |
|---|---|
| Text-to-SQL picks the wrong table | Which source is authoritative |
| Two agents give different answers to the same question | No certified metric definition |
| Answers from a deprecated wiki page | No source tier or ownership |
| "Future sales" answered with a number | No declared coverage window |
| Reconciliation confirmed on a hallucinated match | No entity resolution |
| Ran `DELETE` against prod | No declared environment or blast radius |
| Copilot surfaces salary data | No entitlement propagated to retrieval |
| Emailed an offer to a candidate who hadn't accepted | No precondition on an irreversible action |

**Eight different-looking incidents; one root cause. The enterprise never wrote down what it knows.**

---

## 2. The stack enterprises are actually building

| Layer | What's in it | State in most enterprises |
|---|---|---|
| **7. Governance** | Policy, audit, compliance | Absent or bolted on after an incident |
| **6. Observability / eval** | Langfuse, LangSmith, Arize | Usually the *only* thing adopted |
| **5. Agent runtime** | LangGraph, CrewAI, Bedrock Agents, Copilot Studio, custom | Fragmented; often several in one company |
| **4. Tools / actions** | MCP servers, REST APIs, function calls | **Sprawling and undocumented** |
| **3. Retrieval** | Vector DBs, hybrid search, GraphRAG | Built once, then rots |
| **2. Semantic / metadata** | Catalog, glossary, metrics, lineage, entitlements | **Exists but not machine-queryable — the critical gap** |
| **1. Data** | Warehouse, lakehouse, operational DBs, SaaS, documents | Mature, governed for humans |
| **0. Identity** | IdP, IAM, RBAC | Mature for humans; **agents are outside it** |

**Layers 0–1 are mature. Layers 5–6 are where all the attention and money go. Layers 2–4 are where the failures come from and where nobody is working.**

That is the structural observation. Enterprises spent a decade building data governance for humans — catalogs, glossaries, lineage, access reviews — and then connected a non-human consumer that cannot read any of it.

---

## 3. Nine structural gaps

### Gap 1 — The semantic layer is not queryable at inference time

Most large enterprises **have** a catalog (Collibra, Alation, Atlan, DataHub, Unity Catalog) and a glossary. They are built for humans to browse. The agent cannot consult them mid-request.

The consequence, stated precisely in the 2026 literature: *"An AI agent can answer the same business question two different ways with no error message or warning."* And *"without a data catalog for AI, agents infer meaning from raw schemas and produce semantically wrong outputs at scale."*

**Gartner's projection is the sharpest statement of the risk: 60% of agentic analytics projects that rely solely on MCP will fail by 2028 for want of a consistent semantic layer underneath.**

The requirement is specific: *"business glossaries, metric definitions and semantic tags need to be **queryable at inference time** — when an agent asks what 'active customer' means, the catalog needs to answer with a structured, authoritative definition."* And *"the glossary is the authoritative contract between data producers and AI consumers; every term needs a certified, versioned definition with a named owner."*

**MCP made this worse, not better.** It gave agents cheap access to *tables* without giving them access to *meaning*.

### Gap 2 — Entity resolution is where builds stall

*"Most enterprise builds stall at entity resolution and ontology alignment, not extraction, which LLMs now handle cheaply."*

The canonical failure is chilling in its simplicity: a compliance system retrieves sanctions data about **"John Miller" (sanctioned entity)** when answering a question about **"John Miller" (employee)**. Same string, different real-world entities, no reconciliation.

Every enterprise has the same customer in Salesforce, the ERP, the warehouse and the support system under four different keys. Humans reconcile this by context. Agents concatenate it.

GraphRAG — vector retrieval plus a knowledge graph — reports **up to 35% precision improvement**, and the reason is structural, not statistical: *"the connection between two entities may span multiple relationship hops through intermediary entities, none of which appear in the same document chunk,"* and vector RAG *"cannot synthesise patterns across 1,000 documents because it processes each chunk independently."*

### Gap 3 — Tools have no contracts

An agent's tool list is a set of names and JSON schemas. The schema says what arguments a tool takes. It says nothing about what the tool **does**.

The reversibility taxonomy from the 2026 rollback literature is the clearest formulation:

| Tier | Example | Recovery |
|---|---|---|
| Cheap to reverse | File edits, draft creation | Undo |
| Expensive to reverse | Database writes | **Hand-coded compensating transactions** |
| **Impossible to reverse** | Sent emails, captured payments, records pushed to a partner CRM | **Only prevention works** |

And the prescription: *"each tool should declare scope, required authorization context, data classifications touched, expected side effects, idempotency behavior, and rollback path."*

Almost no enterprise has this for any tool. The agent therefore cannot distinguish "draft an email" from "send an email to 40,000 customers", and neither can any guardrail sitting in front of it.

### Gap 4 — Silent tool failures corrupt the run

*"The LLM simply improvises around broken responses and continues the workflow with corrupted context. Tool call failures are difficult to catch in production without tracing every tool input and output — **the failure stays invisible until users complain**."*

This is a distinctly agentic failure with no analogue in ordinary software. A normal program throws. An agent **reads the error and carries on**, weaving the malformed response into its reasoning. Every downstream step is now built on a corrupted premise, and nothing in the trace looks like an exception.

### Gap 5 — Error propagation makes debugging intractable

*"A wrong decision at step 3 shapes context at step 4, which influences step 5. By step 8, **no individual step looks wrong in isolation** — but the cumulative path was broken from the start. This is the hardest failure mode to debug in production agentic AI systems."*

Per-step evaluation cannot catch this, and per-step evaluation is what every eval tool ships. The unit of correctness is the **trajectory**, not the step — and almost nothing in the market evaluates trajectories.

### Gap 6 — Memory contamination is permanent and contagious

*"An agent that stores an incorrect fact or flawed procedure loads that error into every subsequent session. In multi-agent systems sharing memory pools, one contamination event spreads across the entire system."*

Memory is being adopted enthusiastically as a capability. It is being adopted with **no write-validation, no provenance on stored facts, no TTL, no quarantine and no way to find and remove a bad memory**. This is a data-integrity problem being introduced deliberately, and most teams have not noticed.

### Gap 7 — Tool sprawl degrades the thing it was meant to enable

**3M+ agents now run inside corporations. Mean monitoring coverage: 52%. Only 14.4% of organisations say every agent went live with a full security review.**

MCP is *"the next phase of API sprawl."* Agents suffer *"context window pollution and decision paralysis with thousands of available tools,"* while *"most teams get 80% of the value from 3–5 servers."*

Adding tools makes agents worse past a low threshold — and the incentive structure inside a company pushes every team to add more.

### Gap 8 — Segregation of duties is structurally broken

**The most under-discussed gap in this entire analysis, and the one with a regulator attached.**

> *"Segregation of duties traditionally assumes three separate roles: initiation, authorization and execution — but **a single AI agent can hold all three at once**. One agent connected to your approval workflow, your provisioning system and your payment processor can receive a request, approve it and execute it in seconds, with no one else involved."*

SoD is not best practice; it is a **foundational financial control** underpinning SOX 404. Forty years of internal control design assumes the initiator and the approver are different people. An agent with three integrations collapses that assumption silently — no exception, no alert, no log entry saying "a control was just bypassed."

Compounding factors:
- Auditors are already asking about SoD *"for everyone who can change an AI's decision logic, prompts, training data, integrations, or deployment status"* — prompts are now in audit scope.
- Agents with administrative access should be *"treated as privileged users for audit purposes."*
- **No regulator has issued AI-specific guidance as of the June 2026 SEC Financial Reporting Manual revision.** Companies are inventing the control design themselves.

This is detectable **statically**, from the capability graph, before anything runs.

### Gap 9 — Agents write to systems of record without distributed-transaction discipline

*"As AI agents start calling tools that update systems of record, they become participants in distributed workflows, and their actions need the same discipline as microservice actions: **durable state, authorization, idempotency, retry policy, compensation, observability, auditability**."*

Twenty years of hard-won distributed-systems practice — sagas, compensating transactions, idempotency keys, outbox patterns — is simply absent from agent frameworks. *"A failure could corrupt live data with no recovery path when agents have write access to production systems without a rollback mechanism."*

Agent retries are worse than microservice retries, because an agent may retry with **different arguments** after reasoning about the failure.

---

## 4. What has to exist — and in what form

The through-line: **the agent needs machine-readable, versioned, queryable contracts describing what humans know implicitly.**

Not documentation. Not a wiki. Not a catalog UI. **Declarative artefacts, versioned in git, resolvable at inference time.** Four of them:

### 4.1 Data contract
```yaml
source: warehouse.finance.revenue_daily
tier: system_of_record          # vs approved / unverified / external
owner: finance-data@company.com
freshness_sla: 24h
coverage: { from: 2019-01-01, to: T-1, grain: day }
semantics:
  revenue: "Recognised revenue per ASC 606, excluding intercompany"
  fiscal_year_start: "02-01"
entitlement: { model: openfga, type: finance_report }
supersedes: [warehouse.legacy.rev_old]     # deprecation is machine-readable
```
Answers: which source is real, what the numbers mean, how fresh, who owns it, who may see it. **Most of this already exists in dbt, the catalog, or someone's head.**

### 4.2 Tool contract
```yaml
tool: payments.transfer
side_effects: [money_movement, external_notification]
reversibility: irreversible          # cheap | compensable | irreversible
blast_radius: { unit: transaction, max: 1 }
idempotency: { key: [request_id], window: 24h }
rollback: none                        # explicit: prevention is the only control
environments: [production]
preconditions:
  - verify: crm.candidate.status == "accepted"
    source_tier: system_of_record
    max_age: 5m
authorization_context: [end_user_principal, approver_role]
sod_role: execution                   # initiation | authorization | execution
data_classes: [financial, pii]
```
Answers: what does this actually do, can it be undone, what must be true first, who authorises it, **and which SoD role it occupies.**

### 4.3 Entity contract (the knowledge-graph layer)
```yaml
entity: Customer
canonical_key: customer_id
resolves:
  - { system: salesforce, key: AccountId, confidence: exact }
  - { system: erp,        key: BP_NUMBER, match: [tax_id, legal_name] }
disambiguation_required: true          # "John Miller" the employee vs the sanctioned party
relationships:
  - { to: Contract, via: customer_id, cardinality: 1:n }
```
Answers: are these the same real-world thing. **This is where a knowledge graph earns its place** — not as a fashionable retrieval upgrade, but as the resolution layer that stops the sanctions-list collision.

### 4.4 Agent contract
```yaml
agent: finance-analytics
knowledge_boundary:
  sources: [warehouse.finance.*]
  answerable: [fact, aggregate, trend]
  unanswerable: [prediction, opinion]
capabilities: [warehouse.query, report.generate]
sod_roles: [initiation]                # may NOT also authorise or execute
escalation:
  must_escalate_when: [low_calibrated_confidence, regulated_topic, out_of_boundary]
memory: { write_validation: required, ttl: 90d, provenance: required }
```

### 4.5 Why contracts and not policies

A guardrail rule says *"block DELETE without WHERE."* A contract says *"this tool is irreversible, affects at most one row, and requires verified state."* **Rules are guesses; contracts are declarations.**

This is also, precisely, why guardrails are so hard to tune — the industry's #1 and #2 stated pain points are latency and false positives, and *"without violation specificity, tuning becomes guesswork."* Teams are hand-writing rules to approximate facts that were never written down. **Derive the rules from the contracts and the tuning problem substantially dissolves.**

---

## 5. Where the data, metadata and graph layers fit

| Layer | Job | Mature OSS | Reality |
|---|---|---|---|
| **Data** | Store, serve | Postgres, Iceberg, DuckDB | Solved |
| **Catalog / metadata** | What exists, who owns it, lineage | **DataHub**, **OpenMetadata**, **Marquez/OpenLineage** (all Apache-2.0) | Exists, **not queryable at inference time** |
| **Semantic / metrics** | What terms mean, certified definitions | **Cube**, **dbt Semantic Layer**, **Malloy** | Adopted for BI, **not wired to agents** |
| **Knowledge graph** | Entity resolution, multi-hop relationships | **Neo4j** (GPL/commercial), **Apache Jena**, **Kùzu** (MIT), **Oxigraph** (MIT) | Rare; **where builds stall** |
| **Entitlement** | Who may see what | **OpenFGA**, **SpiceDB**, **Cerbos** (all Apache-2.0) | Mature; **not connected to retrieval** |
| **Tool registry** | What actions exist and what they do | MCP schema *(arguments only)* | **No side-effect vocabulary exists anywhere** |

**Two observations that matter more than the table:**

1. **Almost every primitive already exists as mature open source.** DataHub, OpenLineage, Cube, OpenFGA, Kùzu. The gap is not missing technology — it is that **none of them is connected to the agent at decision time.** The enterprise built the metadata layer for a BI tool and a compliance team, then plugged in a consumer that speaks a different protocol.
2. **The one genuine absence is a side-effect vocabulary for tools.** OpenAPI describes request and response shape. MCP describes arguments. **Neither describes consequence.** There is no standard for "this call is irreversible." That is a missing standard, not a missing product — and it is the single highest-leverage thing anyone in this space could contribute.

---

## 6. What can be built fast and deliver real value

Ranked on value ÷ effort, and deliberately independent of whether we build it.

### 6.1 The harvest-and-gap-report pattern

**Nobody will write these contracts from scratch.** That is why data governance programmes fail — they ask humans to author metadata with no immediate payoff.

But **most of it already exists**, scattered:

| Contract field | Already lives in |
|---|---|
| Source ownership, freshness, lineage | dbt manifests, DataHub/OpenMetadata, OpenLineage |
| Metric definitions | dbt Semantic Layer, Cube, LookML |
| Tool arguments | OpenAPI specs, MCP schemas |
| Entitlements | IdP groups, warehouse RBAC, SharePoint ACLs |
| Environments | Terraform, connection strings, deployment config |
| Entity keys | Master data management, CRM/ERP mappings |

**So: import it, infer what you can, and show the gap.**

> *"You have 63 tools registered. **41 have no declared side effects. 9 are irreversible with no precondition. 3 agents can both initiate and approve. 7 sources have no freshness SLA and 4 are stale beyond it.**"*

That report is **cheap to build, immediately legible to an executive, and creates its own urgency.** It is the pattern that works for Copilot readiness assessments, and it works here for the same reason: *the finding motivates the remediation.*

### 6.2 Ranked by value ÷ effort

| # | Build | Why | Effort |
|---|---|---|---|
| **1** | **Contract harvester + gap report** — import dbt, OpenAPI, MCP schemas, IdP groups; infer; report what's undeclared | Diagnostic wedge. Nothing to author before value appears | **S** |
| **2** | **SoD violation detection for agents** | Static analysis over the capability graph. A **SOX control** with auditors already asking and **no regulator guidance yet**. Nobody in the vendor landscape does it. Sells to the CFO, not just the CISO | **S** |
| **3** | **Tool contract schema + registry** — the side-effect vocabulary | The missing standard. Everything else composes on it. Publishing it openly is a category-defining move | **S–M** |
| **4** | **Semantic resolution at inference time** — proxy the catalog/glossary so an agent can ask "what is *active customer*" and get a certified answer | Directly attacks the failure Gartner projects will kill 60% of agentic analytics projects | **M** |
| **5** | **Silent tool-failure detection** — flag when a tool returns an error/malformed payload and the agent continues anyway | Invisible today "until users complain." Detectable from traces we already have | **S** |
| **6** | **Trajectory evaluation** — score the path, not the step | Per-step eval structurally cannot catch step-8 compounding | **M** |
| **7** | **Memory write-validation, provenance and TTL** | Contamination is permanent and contagious; being adopted with no controls at all | **M** |
| **8** | **Entity resolution / disambiguation guard** — block or escalate when an ambiguous entity match drives a decision | The sanctions-list collision. High severity, low frequency | **M–L** |
| **9** | **Compensating-transaction registry** — declared rollback path per tool; refuse irreversible actions with no compensation and no precondition | Brings saga discipline to agents | **M** |

**Items 1, 2, 3 and 5 are all Small.** Together they form a coherent product — *"we read your existing infrastructure, tell you what your agents don't know, and enforce what you declare"* — and none of them requires the customer to author anything before seeing value.

---

## 7. Honest implications for our roadmap

Held to the end on purpose, because the analysis above stands regardless of what we build.

**What this says about the eleven pillars:** they are largely *enforcement mechanisms for contracts that don't exist yet.* Pillar 9 (action assurance) is enforcing a tool contract. Pillar 7 (answerability) is enforcing an agent contract. Pillar 8 (provenance) is enforcing a data contract. Pillar 10 (entitlement) is enforcing an entitlement contract.

**We built the enforcement layer and skipped the declaration layer.** That is why the guardrails are hard to tune — the same reason it's hard for everyone.

**Four things genuinely missing from the PRD entirely:**

1. **Segregation of duties** (Gap 8) — a SOX-adjacent control, statically detectable, absent from every competitor
2. **Silent tool-failure detection** (Gap 4) — a distinctly agentic failure mode with no analogue in normal software
3. **Trajectory evaluation** (Gap 5) — per-step scoring cannot catch compounding error
4. **Memory governance** (Gap 6) — contamination is permanent and spreads across multi-agent systems

**One thing the PRD gets structurally wrong:** it treats semantics as our data to define (source tiers, knowledge boundaries) when in most enterprises that metadata already exists in dbt, DataHub or Cube. **Harvest beats author, every time.**

**And a strategic caution.** If contracts are the layer that matters, the catalog and semantic-layer vendors — Atlan, Collibra, DataHub, dbt, Cube — are closer to it than any AI-governance vendor. They already own the metadata. Several are actively repositioning around "context layer for AI agents." **They are a more serious long-term threat than Zenity or Credo AI**, and none of the analysis to date accounted for them.

---

## Sources

**Semantic layer & catalog:** [Governed semantic layer for AI](https://www.ovaledge.com/blog/governed-semantic-layer-for-ai) · [Atlan — context layer for AI agents](https://atlan.com/know/context-layer-for-ai-agents/) · [Atlan — context catalog](https://atlan.com/know/context-catalog/) · [Atlan — data catalog for AI](https://atlan.com/know/data-catalog-for-ai/) · [Why AI agents need a semantic layer](https://databox.com/semantic-layer-for-ai) *(incl. Gartner: 60% of MCP-only agentic analytics projects fail by 2028)* · [Tellius — what is a context layer](https://www.tellius.com/resources/blog/what-is-a-context-layer-for-ai-agents-the-definitive-guide-for-2026)

**Context engineering:** [Why AI agents fail in 2026 — the context problem](https://memeburn.com/why-ai-agents-fail-in-2026-the-context-problem-no-one-talks-about/) *(73% figure)* · [Redis — state of context engineering 2026](https://redis.io/resources/state-of-context-engineering-2026/) · [Why AI agents fail in production](https://dev.to/hadil/why-ai-agents-fail-in-production-and-how-engineering-teams-are-fixing-it-in-2026-job) *(silent tool failures, error propagation, memory contamination)* · [Sourcegraph — context engineering](https://sourcegraph.com/blog/context-engineering)

**Knowledge graph & entity resolution:** [Entity-resolved knowledge graphs — the foundation for GraphRAG](https://odsc.medium.com/entity-resolved-knowledge-graphs-the-foundation-for-effective-graphrag-e19e2d4779f9) · [Knowledge graphs for enterprise AI beyond RAG](https://www.trantorinc.com/blog/knowledge-graphs-enterprise-ai) · [Atlan — knowledge graph for AI agents](https://atlan.com/know/ai-agent/knowledge-graph-for-ai-agents/) · [Oracle — GraphRAG](https://blogs.oracle.com/developers/graphrag-with-oracle-ai-database-26ai-knowledge-graphs-for-enterprise-ai-systems)

**MCP sprawl:** [MCP server sprawl — AI technical debt](https://www.datamanagementblog.com/mcp-server-sprawl-the-ai-technical-debt-enterprises-need-to-stop-now/) · [Qualys — MCP servers, the new shadow IT](https://blog.qualys.com/product-tech/2026/03/19/mcp-servers-shadow-it-ai-qualys-totalai-2026) · [WorkOS — MCP sprawl invisible to shadow IT tools](https://workos.com/blog/mcp-sprawl-invisible-to-shadow-it-tools) · [Requesty — MCP ecosystem 2026](https://www.requesty.ai/blog/mcp-ecosystem-2026-building-agent-tool-infrastructure-that-scales) *(Gravitee: 3M+ agents, 52% monitoring coverage, 14.4% full security review)*

**Segregation of duties & SOX:** [Why AI agents break segregation of duties controls](https://www.cloudeagle.ai/blogs/segregation-of-duties-ai-agents) · [What your SOX auditor will ask about AI automation in 2026](https://www.kognitos.com/blog/sox-auditor-questions-ai-automation/) · [2026 SOX compliance — every AI agent is a financial risk](https://www.safepaas.com/blog/2026-when-every-ai-agent-becomes-a-sox-risk/) · [SOX 404 checklist for AI-assisted controls](https://www.finrep.ai/blog/sox-404-compliance-checklist-for-ai-assisted-controls-2026)

**Transactions & rollback:** [Oracle — when AI agents meet enterprise reality](https://blogs.oracle.com/database/ai-agents-enterprise-reality-workflows-transactions-runtime-controls) · [Agent rollback and checkpoint patterns](https://www.digitalapplied.com/blog/agent-rollback-checkpoint-patterns-2026-engineering-reference) · [The data rollback problem](https://tianpan.co/blog/2026-04-20-ai-agent-data-rollback-production) · [Execute, verify and roll back agent actions](https://digitalthoughtdisruption.com/2026/07/25/execute-verify-rollback-agent-actions/)

**Caveat:** much of this is practitioner and vendor writing rather than peer-reviewed work, and vendors describing a gap they sell into have an obvious interest. The failure *mechanisms* (silent tool failure, error propagation, memory contamination, SoD collapse) are corroborated across independent sources and are mechanically plausible. The *quantitative* claims — 73%, 60%, 35%, 52% — come from single sources and should be treated as directional.
