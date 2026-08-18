# Nometria — Product Requirements Document

**Agent-native, vendor-neutral governance, security and assurance for AI agents in production.**

| | |
|---|---|
| **Version** | 3.0 — consolidated |
| **Date** | 2026-08-18 |
| **Status** | Approved for build |
| **Supersedes** | [PRD v1](PRD.md) (six pillars) and [PRD v2](PRD-v2.md) (agent assurance) — both retained for history |
| **Grounded in** | [Failure-mode analysis](failure-modes.md) · [Gap analysis](gap-analysis.md) · [OSS register](appendix-a-oss-register.md) · [Control catalog](appendix-b-control-catalog.md) |
| **Positioning** | Horizontal (no vertical beachhead) · self-host default · vendor-neutral |

> **This document is self-contained.** It assumes no prior knowledge of the project. Every claim is sourced; every requirement states what open source and what commercial products already do it, and where the industry state of the art actually sits.

---

## Part 0 — Orientation

### 0.1 What this product is, in plain terms

Companies are putting AI agents into production — software that reads a request, looks things up, decides, and then **takes actions** in real systems: creating tickets, sending email, updating a CRM, moving money, running database queries.

Unlike ordinary software, an agent is non-deterministic. It can be persuaded by text it reads. It can state something false with complete confidence. It can call a tool with arguments it invented.

**Nometria sits between the agent and the world** and answers nine questions about every agent an organisation runs:

| | Question | Pillar |
|---|---|---|
| 1 | What agents do we even have? | Discovery & Registry |
| 2 | What is this agent allowed to touch? | Identity & Authorization |
| 3 | How do we stop the bad thing before it happens? | Runtime Guardrails |
| 4 | Does it actually work? | Evaluation & Reliability |
| 5 | Can we show exactly what happened? | Audit & Traceability |
| 6 | Can we prove we meet the rules? | Policy & Compliance |
| 7 | **Should it answer this at all?** | Answerability & Abstention |
| 8 | **Where did that answer come from?** | Provenance & Source Authority |
| 9 | **What will this action actually do?** | Action Assurance |
| 10 | **Is this person allowed to see it?** | Entitlement & Disclosure |
| 11 | **When must a human take over?** | Escalation Governance |

Pillars 1–6 are the *governance* half — the questions a CISO and an auditor ask. Pillars 7–11 are the *assurance* half — the questions a business owner asks after their agent does something wrong. Most products in this market do one half. The thesis is that the halves are not separable.

### 0.2 Who buys it

| Buyer | Cares about | Lands on |
|---|---|---|
| **Platform / AI engineer** | Shipping without breaking things | Pillars 3, 4, 9 |
| **CISO / Head of Security** | Inventory, least privilege, incident evidence | Pillars 1, 2, 5, 10 |
| **Head of GRC / Compliance** | Framework mapping, auditor evidence, risk register | Pillars 6, 11 |
| **Business owner of the agent** | It works, it doesn't embarrass us | Pillars 7, 8, 11 |

Entry is bottom-up through the platform engineer, who feels the runtime pain first. The CISO and GRC budgets are earned later, not asked for on day one.

### 0.3 How to read this

Requirements are `P<pillar>-<n>`. Each pillar section has a fixed shape:

1. **What it answers** and why it matters
2. **Evidence** — the research and incidents that justify it
3. **Industry state of the art** — what the best current practice actually is
4. **Open-source landscape** — what exists, its licence, and our verdict
5. **Commercial landscape** — who sells this and how
6. **Requirements** — with `BUILD` / `REUSE` / `HYBRID` and current status
7. **Design notes** — the non-obvious decisions

Status: ✅ built and tested · ◐ partial · ✗ specified, not built.

### 0.4 The core doctrine, stated once

> **Wrap the primitive, own the interface.** Where a permissively-licensed, actively-maintained open-source project does a primitive well, we wrap it behind a swappable adapter and spend our engineering on the layer above. Target split: **~20% integrating OSS, ~80% on the differentiated layer.**

This is enforced architecturally — five interfaces (`Detector`, `PolicyEngine`, `EvalRunner`, `RedTeamRunner`, `ModelProvider`, plus new `ActionAnalyser` and `EntitlementEngine`) — and it has already paid for itself twice: when **LLM Guard was archived** (Jul 2026) and when **promptfoo was acquired by OpenAI** (Mar 2026), neither event required a code change.

---

## Part 1 — The problem

### 1.1 The market, honestly

| Signal | Figure | Source |
|---|---|---|
| Enterprise gen-AI spend, 2025 | $37B, ↑3.2× YoY | Menlo Ventures |
| Of which, **dedicated agents** | ~$750M (vs $7.2B copilots) | Menlo Ventures |
| Deployments that are *true agents* | 16% enterprise / 27% startup | Menlo Ventures |
| Agent pilots reaching production | **~10%** | 2026 incident research |
| Enterprises with ≥1 agent security incident in 2025 | **88%** | 2026 incident research |
| Multi-agent pilots reporting confidence in reliability/governance | **< 25%** | 2026 incident research |

**Read this honestly: the market is early.** ~$750M on dedicated agents is not a large market today. The bet is on a growing pain, not a land grab. The 10%-to-production and <25%-confidence numbers *are* the opportunity — they say the blocker is trust, and trust is what this product sells.

### 1.2 How deployed agents actually fail — the finding that shapes the roadmap

A study of **10,000+ catalogued AI failure events** (Jul 2026):

| Failure class | Share |
|---|---|
| Resolution / **escalation breakdowns** | **31.1%** |
| Execution and action failures | **+62%** vs 2024 baseline |
| **Hallucination-related** | **< 10%** |

Most of this market — and the first version of this product — points at hallucination, which is under a tenth of the problem. The two largest classes are *the agent didn't hand off when it should have* and *the agent did something*.

Named incidents worth designing against:

| Incident | What happened |
|---|---|
| **1.9M rows deleted** | AI coding agent connected to **production instead of staging**, executed deletion "flawlessly from a technical standpoint" |
| **Reconciliation confirmed on a hallucinated record** | Finance agent "matched" a transaction by inventing the counterpart. Found at month-end close |
| **Offer email on a hallucinated state** | HR agent emailed a welcome to a candidate who had **not accepted** |
| **Copilot oversharing** | *"A governance failure rather than a security breach — every permission check passed."* One prompt surfaces everything the account can read |
| **Objection hallucination after step 4** | Sales agent degrades predictably with conversation depth |
| **Scheduling agent loops** | Caller goes off-script; agent loops instead of escalating |

Full taxonomy — 50 modes across 7 families — in [failure-modes.md](failure-modes.md).

### 1.2b Where this bites, by business function

The deployments that exist today, what breaks in each, and which pillar covers it. This
is the table to read if you want to know whether this product is relevant to *your* agent.

| Business use case | What the agent does | How it fails in practice | Pillars |
|---|---|---|---|
| **Customer support / service desk** | Answers policy questions, opens and resolves tickets | Answers from a stale KB article; keeps trying instead of escalating an angry customer; marks a ticket resolved that isn't; promises a refund the company must honour | **8, 11, 7** |
| **Internal knowledge assistant** (Copilot-class) | Answers "what do we know about X" over SharePoint, Drive, wikis | **Oversharing** — surfaces salary, M&A or HR content because the index inherits permission debt; every ACL check passes | **10** |
| **Sales / revenue analytics** | Pipeline questions, forecast queries, CRM updates | Asked for **future** revenue and generates a number; cites a personal OneNote instead of the price book; mixes fiscal and calendar year | **7, 8** |
| **Finance / reconciliation** | Matches transactions, chases exceptions, drafts journal entries | **Confirms a match by hallucinating the counterpart record** — discovered at month-end close; currency and unit errors | **7, 8, 9** |
| **Data / BI agent (text-to-SQL)** | Natural-language questions over the warehouse | Generates `DELETE` with no `WHERE`; runs against **prod instead of staging**; a comment-evasion payload slips a `DROP` past keyword filters | **9** |
| **IT ops / incident response** | Triages alerts, executes runbooks, restarts services | Executes an irreversible remediation on a misread signal; duplicates the action on retry; cascades through automations | **9** |
| **HR / recruiting** | Screens CVs, answers policy questions, drives onboarding | **Emails an offer welcome to a candidate who hadn't accepted** — acted on hallucinated state; discriminatory screening; adverse action with no explanation | **9, 6** |
| **Procurement / AP** | Processes invoices, matches POs, schedules payments | Pays against a duplicate invoice; approves outside authority limits; acts on a supplier email carrying an **indirect injection** | **3, 9, 2** |
| **Legal / contract review** | Extracts clauses, flags risk, drafts responses | Cites a clause the document doesn't contain; gives advice it isn't licensed to give; surfaces privileged material under legal hold | **8, 10, 6** |
| **Engineering / code agent** | Writes code, opens PRs, runs migrations | Connects to the wrong environment; drops an index; leaks a secret into a commit | **9, 3** |

**Two patterns run through all ten.** First, the damaging failures are *actions taken on
false premises*, not bad text — which is why Pillar 9's state-verification preconditions
matter more than any classifier. Second, the failure is almost never visible at the moment
it happens: the reconciliation surfaced at close, the offer email surfaced when the
candidate replied, the oversharing surfaced in a regulator complaint. **Detection latency is
the actual business cost**, and it is what the audit and evaluation pillars exist to compress.

### 1.3 Why the existing market doesn't cover it

Four camps. None spans the problem.

| Camp | Who | Strong | Weak |
|---|---|---|---|
| **Agent-security pure-plays** | Zenity, Noma, Arthur, WitnessAI, Astrix, Knostic | Runtime enforcement, discovery | Compliance depth, correctness |
| **Security suites** | Palo Alto (Prisma AIRS), Cisco AI Defense, Check Point (+Lakera), SentinelOne (+Prompt Security) | Distribution, SOC integration | Suite lock-in, not agent-native by origin |
| **AI governance platforms** | IBM, ServiceNow, Truyo (Gartner Leaders); Credo AI, OneTrust, ModelOp, Monitaur, Airia, Holistic AI | Framework mapping, workflow, evidence | **Gartner's own read: most lack runtime enforcement** |
| **Eval / observability** | Braintrust, Arize, Fiddler, LangSmith, Patronus, Galileo, Cleanlab | Measurement depth | Measure, don't enforce; no governance |

**The consolidation is real and recent.** Lakera → Check Point (~$300M) · Galileo → Cisco · promptfoo → **OpenAI** (Mar 2026) · Langfuse → ClickHouse · Weights & Biases → CoreWeave · Protect AI → Palo Alto · Invariant/mcp-scan → Snyk. Any plan that depends on an independent point tool staying independent is a plan with a 12-month half-life.

**Platform risk has escalated too.** *OpenAI Frontier* (Feb 2026) ships identity, permissions, audit trails, compliance controls and evaluation inside an enterprise agent platform, with Fortune 500 adopters. *Microsoft Entra Agent ID + Agent 365* bring agent identity, lifecycle, Conditional Access, access packages and time-bound entitlements from the identity incumbent every enterprise already runs.

### 1.4 The three moats that survive all of that

1. **Neutrality is structural.** A model provider's eval or guardrail that "also supports competitors" is a conflict they will never fully commit to. Microsoft and Palo Alto cannot copy neutrality because they *sell* the lock-in.
2. **Agent-native runtime depth cannot be retrofitted by GRC incumbents.** Governing an agent means governing an execution path — prompts, tool calls, argument provenance, delegation. That is a different data model, not a feature.
3. **Correctness is in scope.** Every pure-security vendor governs *safety*. Pillars 4, 7, 8 govern whether the agent was *right*. That is the half of the problem the security camp structurally does not address.

### 1.5 The regulatory clock

Compliance features sell on deadlines, not merit.

| Date | Obligation | Status |
|---|---|---|
| Feb 2025 | Prohibited practices; AI-literacy duties | **Live** |
| **2 Aug 2026** | EU AI Act **transparency** obligations enforceable | **Live** |
| **2 Dec 2026** | GPAI grace period ends | Imminent |
| 2 Dec 2027 | High-risk standalone systems (Annex III) | Build now, sell 2027 |
| 2 Aug 2028 | High-risk embedded in products (Annex I) | Horizon |

Also: **NIST AI RMF** (+ GenAI profile) is the US baseline buyers ask you to map to; **ISO/IEC 42001** is increasingly required *of vendors*; **SOC 2** is why a mid-market customer buys at all — it unblocks *their* upmarket sales.

---

## Part 2 — Architecture

### 2.1 Shape

```
 Customer's agent                     Nometria                        Outside world
 ────────────────                     ────────                        ─────────────
  SDK  ────────────┐          ┌──────────────────────────┐
  Gateway proxy ───┼─────────►│  Enforcement orchestrator │──────────► Model providers
  OTel ingest  ────┘          │                           │            (OpenAI, Anthropic,
                              │  1 registry   7 answerab. │             Google, Bedrock,
                              │  2 identity   8 provenance│             local, echo)
                              │  3 guardrails 9 action    │
                              │  4 evaluation 10 entitle. │──────────► SIEM / OTLP
                              │  5 audit      11 escalate │            (customer's SOC)
                              │  6 compliance             │
                              └──────────────┬────────────┘
                                             │ public REST API
                                    Control plane (Next.js)
```

**Three integration surfaces, each independently sufficient:**

| Surface | Integration cost | What it sees |
|---|---|---|
| **Inline gateway** — OpenAI/Anthropic-compatible proxy | Change one `base_url` | Everything on the wire |
| **SDK** — decorators, context managers | One decorator | Wire **+ intent + argument provenance** |
| **OTel ingest** | Nothing — point an existing collector | Passive: registry + traces |

The OTel surface matters commercially: a team already emitting OpenTelemetry gets Pillars 1 and 5 with **zero** code change, which is how you get to a first conversation.

### 2.2 Request path

```
identity resolution ─► taint annotation ─► answerability check ─► entitlement filter
  ─► budgeted detector pipeline ─► capability check ─► action analysis ─► policy decision
  ─► human escalation (if needed) ─► provider call ─► post-flight (output, citations,
     schema, silent-failure) ─► trace + audit chain + findings
```

Verdict lattice — the strongest effect any rule produces wins:

```
allow < tokenize < mask < redact < abstain < escalate < block
```

### 2.3 Principles

| | Principle | Consequence |
|---|---|---|
| X-1 | **Drop-in, never re-architect** | Any integration requiring an agent rewrite is a failed integration |
| X-2 | **Neutral by construction** | No feature may depend on one provider, cloud, framework or security suite |
| X-3 | **Wrap the primitive, own the interface** | Swappability is a tested property, not a claim |
| X-4 | **Fail visibly, not silently** | Every decision records its reason, the rule, the evidence. Blocking without an auditable reason is a bug |
| X-5 | **Correctness is in scope** | We govern whether it *worked*, not only whether it was *safe* |
| X-6 | **Evidence is a first-class artefact** | Exportable, tamper-evident, independently verifiable |
| X-7 | **Latency is a product constraint** | Hard p95 budget; over-budget detectors degrade to observe, never block the customer |
| X-8 | **Customer data stays in the customer boundary** | Self-host and zero-egress are day-one architecture |
| X-9 | **Observe before enforce** | Every policy ships in observe mode. A false block is how a guardrail gets switched off permanently |

---

# Part 3 — The eleven pillars

---

## Pillar 1 — Discovery & Agent Registry

### What it answers
*"What agents do we even have?"* Visibility precedes control. You cannot govern an inventory you do not have.

### Evidence
Shadow agents are the #1 stated enterprise anxiety in every 2026 buyer guide. Gartner made **"AI discovery and registry"** an *inclusion criterion* for its first Magic Quadrant for AI Governance Platforms (16 Jun 2026) — a vendor without it is not in the category.

### Industry state of the art
Discovery has moved through three generations in eighteen months:

1. **Self-reported registry** (2024) — a form someone fills in. Rots immediately.
2. **Connector enumeration** (2025–26) — pull agent inventories from the platforms that host them. ServiceNow AI Control Tower ships **~30 enterprise integrations**; Kosmoy pulls four cloud registries (Azure, Bedrock, Vertex, Salesforce/ServiceNow).
3. **Passive observation** (2026) — infer agents from telemetry and network traffic. WitnessAI captures native desktop apps and IDEs at the network layer, which is the only way to see an engineer running an agent locally.

**The frontier is combining all three and reconciling them.** The interesting signal is not the union — it is the *difference*: an agent seen in traffic but not in any registry, or a registry entry with no traffic.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **OpenTelemetry** + OpenLLMetry semconv | Apache-2.0 | Span/trace wire format; agent attributes | **REUSE ★** — our detection substrate |
| `mcp-scan` (Invariant) | Apache-2.0 | MCP server scanning for tool poisoning | **REFERENCE** — Snyk-owned; invoke as external CLI, never link |
| Microsoft Agent Governance Toolkit | MIT | OWASP Agentic coverage across frameworks | **REFERENCE** — competitor-adjacent framing |

**There is no open-source agent registry.** This is a build area.

### Commercial landscape

| Vendor | Approach | Note |
|---|---|---|
| ServiceNow AI Control Tower | ~30 discovery integrations, Traceloop tracing | **Gartner MQ Leader**; requires ServiceNow platform |
| Microsoft Agent 365 | Unified registry, IT-controlled onboarding, Entra identity | Microsoft-centric |
| Zenity | Discovery + posture across SaaS/cloud/endpoint, incl. Copilot Studio | Gartner "company to beat"; **SaaS-only** |
| Arthur | Telemetry, MCP monitoring, network + API discovery | Runs in customer's own cloud |
| OneTrust | Agent Detection (Bedrock, Azure, Vertex) | ~14,000-org installed base |
| Credo AI | Agent Registry | Governance-first; **no runtime** |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P1-1** | Canonical record per agent: models, tools, MCP servers, data sources. Created by registration **or on first observation** | BUILD | ✅ |
| **P1-2** | **Shadow-agent detection** — traffic not correlating to a registered agent raises a finding with first/last seen, volume, models, and a **ready-to-submit registration payload** | BUILD | ✅ |
| **P1-3** | **Lineage from observed behaviour**, not declared config; blast-radius queries | BUILD | ◐ graph + queries; no visual map |
| **P1-4** | Accountable owner, business purpose, environment, data classes, risk tier. **Unowned = reportable finding** | BUILD | ✅ |
| **P1-5** | MCP inventory + hygiene: schema-drift snapshots, instruction-injection in tool descriptions, unpinned servers | HYBRID | ◐ native checks; `mcp-scan` optional |
| **P1-6** | Framework auto-discovery (LangGraph, CrewAI, LlamaIndex, Claude Agent SDK, ADK…) from span attributes | BUILD | ✅ |
| **P1-7** | Registry drift — re-attest declared vs observed models/tools | BUILD | ◐ on demand; no scheduled job |
| **P1-8** | **Connector-based enumeration** — Bedrock, Azure AI, Vertex, Salesforce, ServiceNow, M365 | BUILD | ✗ **Gartner inclusion gap** |

### Design note
P1-3's insistence on **observed** rather than **declared** lineage is the differentiator against GRC incumbents, whose registries are self-reported forms. A registry that only knows what someone typed into it is the spreadsheet the customer already has.

---

## Pillar 2 — Identity, Access & Authorization

### What it answers
*"What is this agent allowed to touch?"* Least privilege for software that acts autonomously with real credentials.

### Evidence
Agents are non-human identities (NHIs) acting with real credentials. Managing them — issuance, scoping, rotation, revocation, posture — has become a distinct control category. OWASP Agentic threats T3 (Privilege Compromise) and T9 (Identity Spoofing) name it directly.

### Industry state of the art
Three converging trends:

1. **Agent-as-identity is now an identity-vendor product.** Microsoft Entra Agent ID gives each agent an Entra identity with Conditional Access, identity governance, **access packages, lifecycle workflows and time-bound access** — plus a required human owner. This is the incumbent bringing 20 years of IGA to agents.
2. **Credential brokerage is the direction of travel.** StrongDM's framing: *"the agent never holds a credential; only the action gets authorized."* Ephemeral, per-action authorisation beats long-lived secrets.
3. **Fine-grained authorisation is standardising on Zanzibar.** OpenFGA (CNCF incubating) and SpiceDB implement Google's ReBAC model; AWS Cedar offers a formally-verified alternative.

**The honest read: we will not out-identity Microsoft.** Generic NHI lifecycle is theirs to lose. Our defensible position is the clause no identity vendor models — a capability scoped by **the provenance of the arguments**, not just by subject/resource/action.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **Open Policy Agent** | Apache-2.0, CNCF **graduated** | General policy engine (Rego); sub-ms decisions | **REUSE ★** — the decision engine |
| **OpenFGA** | Apache-2.0, CNCF **incubating** | Zanzibar ReBAC; `Check`, `ListObjects` | **REUSE ★** — entitlement engine (Pillar 10) |
| **Cedar** | Apache-2.0 (AWS) | Formally verified authz language | **REUSE** — drop-in `PolicyEngine` alternative |
| **SpiceDB** | Apache-2.0 (AuthZed) | Zanzibar ReBAC | Alternative to OpenFGA |
| **Cerbos** | Apache-2.0 | Stateless policy decision point | Alternative |
| **Casbin** | Apache-2.0 | ACL/RBAC/ABAC, many languages | **REUSE** — optional control-plane RBAC |

This layer is **well served by OSS**. Building a bespoke policy engine here would be pure duplicated work.

### Commercial landscape

| Vendor | Approach |
|---|---|
| **Microsoft Entra Agent ID** | Agent identity + IGA: Conditional Access, access packages, time-bound access, named owner |
| **Astrix** | NHI security; identity-based allow/flag/block; automated secret rotation; ITSM/SIEM/SOAR |
| **StrongDM** | Proxy-based; MCP Gateway authorises each tool call; agent holds no credential; continuous session authorisation |
| **Teleport** | Agentic Identity Framework: cryptographic agent identity, ephemeral isolation, MCP protection |
| Okta / Ping | Extending workforce IGA to agents |
| Oso, Permit.io, AuthZed | Authorisation-as-a-service |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P2-1** | NHI lifecycle: issue, scope, rotate (with overlap window), revoke, expire; posture (stale / over-privileged / orphaned) | BUILD | ✅ |
| **P2-2** | **Tool-scoped least privilege, default-deny**, evaluated per call, with **argument-level constraints** (`amount < 1000 AND currency == USD`) | REUSE (OPA) + BUILD | ✅ |
| **P2-3** | Human-in-the-loop approvals: suspend, notify with full decision context, resume/abort, **deny-on-timeout** | BUILD | ✅ |
| **P2-4** | SSO (OIDC/SAML), SCIM, RBAC — 6 roles; `auditor` can read everything and mutate nothing | REUSE + BUILD | ◐ RBAC ✅; **IdP not wired** |
| **P2-5** | **Delegation narrowing** — a sub-agent's capabilities must be a subset of the parent's; widening rejected **at write time** | BUILD | ✅ |
| **P2-6** | Credential brokerage — short-lived, per-call, scoped credentials; agent never holds a long-lived secret | BUILD | ✗ |
| **P2-7** | **Policy simulation** — replay recorded traffic against a candidate policy; report newly blocked/allowed/escalated | BUILD | ✅ |
| **P2-8** | Entra Agent ID / Okta federation for NHI | HYBRID | ✗ |

### Design note
**P2-7 is disproportionately important for adoption.** The reason security tooling gets configured permissively and left there is that nobody can predict what tightening a rule will break. Replaying real traffic converts a scary change into a reviewed diff — and it is only possible because Pillar 5 stores the full execution path.

---

## Pillar 3 — Runtime Guardrails & Security

### What it answers
*"Stop the bad thing before it happens."* Inline detection and blocking on every untrusted surface.

### Evidence
Security is the **#2 barrier** to production at 2,000+ employee organisations (24.9%). OWASP LLM01 (Prompt Injection) and LLM02 (Sensitive Information Disclosure) are the top two entries in the canonical taxonomy. Indirect injection — the payload arriving via retrieved content or a tool result — is the highest-severity realistic attack on an agent.

### Industry state of the art
**Latency is the competitive bar.** Lakera set the reference point at **sub-50ms**, deploying "in minutes with no changes to models or prompts." Anything slower is a performance incident waiting to happen.

**But the strategic consensus has shifted from detection to containment.** Detection alone is a losing arms race: novel phrasings evade classifiers indefinitely. The durable defence is to assume the model can be convinced of anything and constrain what a convinced model is permitted to *do*. Zenity's public framing — *"intent-based detection examines the full execution path including tool calls, memory access, and data usage"* — is the closest competitor articulation.

**The category consolidated hard.** Lakera → Check Point (~$300M). Protect AI → Palo Alto, with **LLM Guard archived 9 Jul 2026**. Galileo → Cisco. Prompt Security → SentinelOne. Independent point tools in this layer are being absorbed.

### Open-source landscape

| Project | Licence | Health | Does | Verdict |
|---|---|---|---|---|
| **Presidio** (Microsoft) | MIT | Active ★ | PII detection, anonymisation, custom recognisers | **REUSE ★** — de-facto standard; rebuilding is duplicated work |
| **Granite Guardian** (IBM) | **Apache-2.0** | Active | Safety/risk classifier; harm, jailbreak, RAG hallucination | **REUSE ★** — *cleanest licence in the classifier group* |
| **NeMo Guardrails** (NVIDIA) | Apache-2.0 | Active | Programmable rails (Colang) | **REUSE** — adapter |
| **Guardrails AI** | Apache-2.0 core | Active | I/O validation, structured output, Hub validators | **REUSE ⚠** — *Hub validators carry independent licences* |
| Llama Guard / Prompt Guard | Llama Community | Active | Safety classifiers | **REUSE ⚠** — **not OSI**; AUP + >700M-MAU clause; opt-in only |
| ShieldGemma | Gemma Licence | Active | Safety classifier | **REUSE ⚠** — not OSI |
| LLM Guard | MIT | **Archived Jul 2026** | 15 input + 20 output scanners | **REFERENCE** — mine the scanner taxonomy, don't depend |
| Rebuff, Vigil | Apache-2.0 | Stale | Multi-layer injection detection, canary tokens | **REFERENCE** — patterns reimplemented natively |

**Licence discipline matters commercially.** Granite Guardian is the default *because* it is true Apache-2.0. A customer must not inherit an acceptable-use policy by running `docker compose up`.

### Commercial landscape

| Vendor | Approach | Note |
|---|---|---|
| **Lakera** (Check Point) | Sub-50ms inline; injection, jailbreak, data exposure, unsafe tool use | Now inside a security suite |
| **Palo Alto Prisma AIRS** | AI Runtime Security, Model Security, Posture Management, Red Teaming | SOC-stack play |
| **Cisco AI Defense** | Model validation (ex-Robust Intelligence), network-enforced guardrails, DefenseClaw sandbox | Strongest with the Cisco stack |
| **Zenity** | Intent-based detection over the full execution path; inline step-level prevention in Copilot Studio | **Closest philosophical rival** |
| **WitnessAI** | Network-level; intent-based policy **beyond allow/block: warn, route, redact**; PII tokenisation | Captures desktop apps + IDEs |
| **Noma** | Discovery, posture, adaptive red teaming, runtime; self-hostable | $132M raised |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P3-1** | Injection/jailbreak detection on **all** untrusted surfaces — input, retrieved, tool results, sub-agent output. Indirect injection scored *higher* than direct | HYBRID | ✅ |
| **P3-2** | PII/DLP **both directions**; actions allow/redact/mask/tokenise/block; jurisdiction packs | REUSE (Presidio) + BUILD | ✅ |
| **P3-3** | Secrets detection — known formats + entropy **paired with an assignment cue** (entropy alone is noise) | BUILD | ✅ |
| **P3-4** | **Tool-call containment (intent-based)** — policy over the full execution path with **argument provenance** | BUILD | ✅ |
| **P3-5** | Content safety classification, category-scored | REUSE (Granite Guardian) | ◐ lexicon + adapter; weights not bundled |
| **P3-6** | Latency budget: concurrent detectors, per-detector timeout, **degrade to observe and raise a finding** — never silently skip | BUILD | ✅ |
| **P3-7** | Fail-open / fail-closed per policy and environment, as a governed audited setting | BUILD | ✅ |
| **P3-8** | Residency / VPC / self-host, zero egress | BUILD | ✅ default mode |
| **P3-9** | Output schema/contract enforcement; repair, retry or block | HYBRID | ◐ native validator |
| **P3-10** | Rate, cost and **loop containment**; recursion depth | BUILD | ✅ |
| **P3-11** | Detector swappability + measured latency and precision | BUILD | ✅ |

### Design note — the differentiator
A model-era filter asks *"is this string malicious?"*. The agent-native question is *"should this **action** happen, given where its arguments came from?"*

We implement **taint tracking**: content from untrusted sources (retrieval, tool results, sub-agents, memory) is tagged; the tag propagates into tool-call arguments — **inferred automatically** by matching argument values against tainted content, so the customer instruments nothing; and policy can require that a high-impact tool never receives a tainted argument without human approval.

**This holds even when detection fails entirely.** It is the single most defensible piece of runtime engineering in the product and has no equivalent in any OSS project surveyed.

---

## Pillar 4 — Evaluation & Reliability Assurance

### What it answers
*"Does it actually work?"* The line between this product and every pure-security vendor.

### Evidence
89–94% of teams have observability; only **52.4% run offline evals**, 37.3% online, and **22.8% run none at all**. Fewer than 1 in 3 are satisfied with their tooling. Roughly **78% of AI failures are "invisible"** — plausible-but-wrong outputs nobody catches (Bessemer, citing the WildChat study).

**Counterweight, and it matters:** hallucination is **<10%** of catalogued production failures. This pillar is real and differentiated, but it is not where most failures live. Size the investment accordingly.

### Industry state of the art
**Real-time evaluation models are the frontier.** The 2026 shift is from batch offline scoring to per-request evaluation cheap enough to run inline:

- **Cleanlab TLM** wraps *any* base LLM, combining self-reflection, consistency across sampled responses and probabilistic measures. Benchmarks show it detecting incorrect RAG responses with **higher precision/recall than HHEM, Patronus Lynx and Prometheus 2**, and better than LLM-as-judge or token probabilities. Crucially it needs **no custom-trained model**, so it works with frontier models on release day.
- **Vectara HHEM** is a purpose-trained factual-consistency model with a probabilistic reading (0.8 → 80% probability the response is consistent with context).
- **Galileo Luna-2** targets fast, cheap evaluators at scale for inline policy checks.

**The category consolidated in under a year:** promptfoo → **OpenAI**, Galileo → Cisco, Langfuse → ClickHouse, W&B → CoreWeave.

**The unclaimed position: everyone measures, nobody enforces.** Braintrust gates CI. Nobody ties an eval result to a *governance control* whose status an auditor reads.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **Garak** (NVIDIA) | Apache-2.0 | LLM vulnerability scanner: injection, jailbreak, leakage | **REUSE** — `RedTeamRunner` |
| **PyRIT** (Microsoft) | MIT | Orchestrated adversarial campaigns | **REUSE** — `RedTeamRunner` |
| **Giskard** | Apache-2.0 | LLM scan: vulnerabilities, bias, hallucination | **REUSE** — optional |
| **Ragas** | Apache-2.0 | RAG metrics: faithfulness, answer relevancy, context precision | **REUSE** — Pillar 8 scorers |
| **DeepEval** | Apache-2.0 | Pytest-style LLM eval | Alternative |
| **Patronus Lynx** | Open weights | Purpose-trained hallucination detection | **REUSE** — optional scorer |
| **Arize Phoenix** | Apache-2.0 (ELv2 for some) | Tracing + eval | Alternative |
| **promptfoo** | MIT | Eval + red-team, CI gating | **REFERENCE ⚠** — **OpenAI-owned since Mar 2026**; demoted off the critical path |
| **AbstentionBench** | Research | 20 datasets, 35k+ unanswerable queries | **ADOPT** — Pillar 7 test corpus |

### Commercial landscape

| Vendor | Approach | Pricing |
|---|---|---|
| **Braintrust** | Evals-first: versioned datasets, experiments, **CI regression gating** | Usage-based, free tier |
| **Cleanlab** | TLM trustworthiness scoring; best-benchmarked real-time detection | Sales-led |
| **Galileo** (Cisco) | Luna-2 evaluators; real-time unsafe-output / injection / PII checks | Sales-led |
| **Vectara** | HHEM factual consistency | Sales-led |
| **Arize / Fiddler** | Drift, monitoring, explainability; ML heritage | Sales-led |
| **LangSmith** | Datasets with splits, pairwise comparison, self-host K8s | **$39/seat**, free tier |
| **Patronus** | Evaluator models, benchmarks, tracing | Sales-led |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P4-1** | Offline eval + **CI regression gating**; direction-aware scorers; JUnit + SARIF; non-zero exit | BUILD (+ optional promptfoo) | ✅ |
| **P4-2** | Online eval on sampled production traffic with the **same scorers**; drift via PSI/KS | BUILD | ✅ |
| **P4-3** | **Silent-failure detection** — 6 signal families: groundedness, self-consistency, contract violation, behavioural anomaly, hedging, task completion | BUILD | ✅ |
| **P4-4** | Automated red-teaming; posture over time | REUSE (Garak/PyRIT) + BUILD | ◐ static suite; no scheduled campaigns |
| **P4-5** | Scorer library + plugin interface; LLM-judge with **pinned model and recorded rubric** | BUILD | ✅ |
| **P4-6** | Versioned datasets; **promote a production failure to a regression test** | BUILD | ✅ |
| **P4-7** | Reliability SLOs with error-budget burn | BUILD | ✅ |
| **P4-8** | **Cross-model comparison** — the neutrality proof-point a provider structurally will not do well | BUILD | ✅ |
| **P4-9** | Real-time evaluator adapters (Cleanlab TLM, HHEM, Lynx) behind the `Scorer` interface | HYBRID | ✗ |

### Design note
A **refusal is not a silent failure.** Scoring visible refusals as failures floods the queue with the safest outputs the agent produces — a detector whose top hits are all correct behaviour gets switched off. Our ensemble short-circuits on refusal. Likewise `task_completion` deliberately does *not* score goal-statement overlap: a goal is written as an instruction ("state the refund window") and a correct answer restates none of it, so overlap would punish correctness.

---

## Pillar 5 — Audit, Observability & Traceability

### What it answers
*"Show me exactly what happened."* The evidence layer.

### Evidence
EU AI Act **Art. 12** requires automatic record-keeping for high-risk systems; **Art. 19** covers log retention. OWASP Agentic **T8 (Repudiation & Untraceability)** names the threat. Observability is at 89–94% adoption — table stakes, not a differentiator.

### Industry state of the art
**OpenTelemetry + OpenLLMetry is the settled wire standard.** ServiceNow's runtime tracing is Traceloop-based; every serious platform ingests OTLP. Building a proprietary trace format in 2026 is a mistake.

**Tamper-evidence is the unclaimed gap.** In most products "immutable" means "we did not build a DELETE endpoint." That does not survive an auditor. The techniques are well established outside this market — Certificate Transparency (RFC 6962) Merkle logs, Google Trillian, Sigstore Rekor — but **no AI governance vendor advertises a hash-chained audit log with an independently runnable verifier.**

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **OpenTelemetry** + OpenLLMetry | Apache-2.0, CNCF | Trace/metric/log standard + LLM semconv | **REUSE ★** — the spine |
| **Trillian** (Google) | Apache-2.0 | Verifiable Merkle transparency log | Reference for the chain design |
| **Sigstore / Rekor** | Apache-2.0 | Transparency log + signing | Reference for checkpoint signing |
| **Langfuse** | MIT core | LLM observability, self-hostable | **REUSE/REF** — ClickHouse-acquired; export target only |
| **Helicone** | Apache-2.0 | Proxy logging, cost tracking | **REUSE** — optional |
| **immudb** | **BSL-1.1** | Immutable database | **EXCLUDED** — source-available, not OSS |

### Commercial landscape
Datadog LLM Observability · Arize · Fiddler · ServiceNow (Traceloop) · Langfuse Cloud. **All trace; none provide evidentiary tamper-evidence.**

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P5-1** | Full execution path: prompts, retrievals, tool calls + arguments, delegations, guardrail decisions, errors | REUSE (OTel) + BUILD | ✅ |
| **P5-2** | **Tamper-evident audit log** — hash-chained, signed checkpoints, detects insertion, deletion, reordering, mutation | BUILD | ✅ |
| **P5-3** | **Auditor evidence package** — traces, decisions, policy versions in force, eval results, approvals, control narrative, manifest with per-file digests | BUILD | ✅ |
| **P5-4** | SIEM export: OTLP, JSONL, **CEF, LEEF**, webhook — never require our storage as their system of record | REUSE + BUILD | ✅ |
| **P5-5** | Retention, **redaction at capture**, legal hold | BUILD | ✅ (no deletion daemon) |
| **P5-6** | Trace search and replay against a candidate policy or model | BUILD | ✅ |
| **P5-7** | Provenance and chain-of-custody, **independently verifiable without access to our systems** | BUILD | ✅ |

### Design note
`entry.digest = H(seq ‖ timestamp ‖ payload_digest ‖ prev_digest)`, checkpoints signed with a key held **outside** the application database, and `verify()` implemented as a **pure function over exported rows**. The evidence package ships `verify_chain.py` — standard library only — so an auditor can validate the chain without trusting or contacting us.

This is cheap to build correctly at the start and effectively impossible to retrofit: the entries you already wrote were never chained.

CEF and LEEF are not nostalgia. ArcSight and QRadar are what large regulated buyers actually run, and they are the Tier-C buyer this pillar exists for.

---

## Pillar 6 — Policy & Compliance Management

### What it answers
*"Prove we meet the rules."* One control set, many regimes.

### Evidence
Governance moved from near-absent (2025) to **the factor separating pilots from production** (2026). Gartner published its **first Magic Quadrant for AI Governance Platforms on 16 June 2026** — 13 vendors; Leaders IBM, ServiceNow, Truyo.

**The inclusion criteria are the category definition.** All generally available by 1 April 2026:

| Criterion | Our status |
|---|---|
| AI discovery and registry | ✅ (gateway/OTel; ✗ connectors) |
| Compliance risk management | ✅ |
| Policy management and enforcement | ✅ **stronger than the field** |
| **Dynamic risk scoring** | ✗ |
| Evidence collection | ✅ **best-in-class** |
| **Interoperability** | ✗ |
| **Workflow and approvals** | ◐ runtime only |
| Complete audit trail | ✅ **differentiated** |

We would **fail to qualify on three criteria** today.

### Industry state of the art
**Gartner's own finding is the strategic opening:** *"most vendors lack runtime enforcement, a critical gap for regulated buyers."* The governance camp measures the *program layer* — questionnaires, attestations, review cycles — and cannot observe what the agent did.

The reverse is also true: the security camp has runtime and no framework mapping. **Nobody spans it**, which is precisely the thesis.

**The differentiator available: computed vs attested.** Credo AI and OneTrust largely *collect attestations* — someone confirms the control operates. Because we are inline, we can **compute** control status from the same execution data that drives enforcement. That is a claim only an agent-native platform can make.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **OSCAL** (NIST) | Public domain | Machine-readable control catalogs, profiles, assessment results | **ADOPT** — the right export format for control catalogs |
| **OWASP LLM Top 10** / **Agentic T1–T15** | Open | Risk taxonomies | **ADOPT** — the buyer's language |
| **MITRE ATLAS** | Open | Adversarial ML threat matrix | **ADOPT** — SOCs already correlate on it |

**Appendix A's coverage map is blunt: OSS coverage for this pillar is essentially none.** Mapping controls to regimes requires product integration and domain work, not a library. That is exactly why it is the moat.

### Commercial landscape

| Vendor | Gartner position | Strength | Weakness |
|---|---|---|---|
| **IBM watsonx.governance** | **Leader** | AI Factsheets, SR 11-7 model-risk workflows, FedRAMP GovCloud | No inline gateway; shadow AI needs Guardium |
| **ServiceNow AI Control Tower** | **Leader** | ~30 integrations, MCP gateway, kill switches | Requires ServiceNow |
| **Truyo** | **Leader** | Privacy heritage | — |
| **Credo AI** | Visionary | Policy Packs (EU AI Act, NIST, ISO 42001, SOC 2, **NYC LL144**), CE-marking support | **No runtime enforcement**; SaaS-only |
| **OneTrust** | Visionary | ~14,000-org base; third-party AI vendor risk | AI Guard scoped to dev/test; no gateway |
| **ModelOp** | Visionary | SR 11-7 heritage; Kong gateway integration | Not in the request path itself |
| **Holistic AI** | Challenger | Bias auditing, NYC LL144 / EU DSA audit heritage | No gateway; no FinOps |
| **Airia** | Visionary | Runtime enforcement in the request path; air-gapped deployment | No named ISO 42001/NIST control libraries |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P6-1** | Policy-as-code driving **both** runtime enforcement and audit reporting; immutable versions; observe→enforce promotion | REUSE (OPA) + BUILD | ✅ |
| **P6-2** | Control catalog mapped to **7 frameworks**: EU AI Act, NIST AI RMF, ISO 42001, SOC 2, OWASP LLM, OWASP Agentic, MITRE ATLAS | BUILD | ✅ 36 controls, 257 mappings |
| **P6-3** | Risk register with EU AI Act classification, mitigations, residual risk, review cadence, sign-off | BUILD | ✅ |
| **P6-4** | **Continuous compliance — status computed from telemetry**, not attested; nine rule kinds | BUILD | ✅ |
| **P6-5** | Obligation calendar tracked against the agent inventory | BUILD | ✅ |
| **P6-6** | Board / executive risk view | BUILD | ✅ |
| **P6-7** | Policy packs per regime and vertical | BUILD | ◐ EU AI Act high-risk + baseline |
| **P6-8** | Framework versioning with change diffs | BUILD | ◐ versioned, no diff engine |
| **P6-9** | **Dynamic risk scoring** — continuous, signal-driven per-agent score | BUILD | ✗ **Gartner gap** |
| **P6-10** | **Assessment / workflow engine** — questionnaires, review cycles, attestations, task routing | BUILD | ✗ **Gartner gap** |
| **P6-11** | OSCAL export of the control catalog and assessment results | HYBRID | ✗ |

### Design note — honesty as a feature
**All 257 framework mappings ship as `review_status: draft`.** They are engineering drafts from the framework texts, not legal advice, and the product **excludes drafts from evidence packages** until a qualified reviewer signs them off. Every framework view also renders a **declared gap list** — what we do *not* cover (conformity assessment, CE marking, EU database registration, ISO 42001 clauses 4–10).

A compliance product that claims total coverage fails its first serious audit conversation. Publishing the gaps is disproportionately credible and costs nothing but discipline.

---

## Pillar 7 — Answerability & Abstention

> *"If someone asks for future sales, the answer should be 'data not available' — not a generated number."*

### What it answers
*"Should it answer this at all?"* Knowing what the system **cannot** know, and refusing before generation rather than fabricating.

### Evidence
**AbstentionBench** (20 datasets, 35,000+ unanswerable queries) finds that **reasoning fine-tuning frequently degrades abstention**. Models are getting *worse* at saying "I don't know" as they get more capable. A property that degrades with model upgrades cannot be delegated to the model.

The twin failure is equally real: retrieval noise causes **over-refusal**, where the model refuses questions it could answer. *"Instead of being helpful, the retrieval system tricks the model into silence."* An abstention control that only pushes one way destroys usefulness.

### Industry state of the art
The market solves an adjacent problem and calls it this one. **Cleanlab TLM**, **Vectara HHEM**, **Patronus Lynx** and **Galileo Luna-2** all score *confidence or factual consistency of a generated answer* — that is post-hoc scoring of something already produced.

**Nobody declares a knowledge boundary and routes on it pre-flight.** The distinction matters:

| Approach | When | What it costs | What it prevents |
|---|---|---|---|
| Confidence scoring (market) | After generation | Full generation + eval | Nothing — you still generated it |
| **Boundary routing (ours)** | Before generation | A cheap classification | The fabrication ever existing |

And the deeper problem, stated in the escalation literature: **the confidence number is not trustworthy.** *"Models trained with RLHF are systematically miscalibrated, with their highest verbal confidence often correlating with incorrect outputs."* A control built on self-reported confidence is built on sand.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **AbstentionBench** | Research | 20 datasets, 35k+ unanswerable queries | **ADOPT** — our test corpus |
| **Ragas** | Apache-2.0 | Answer relevancy, context precision/recall | **REUSE** — supporting scorers |
| **DeepEval** | Apache-2.0 | Pytest-style eval incl. relevancy | Alternative |
| `dateparser`, `duckling` | BSD / Apache-2.0 | Natural-language temporal parsing | **REUSE** — temporal-scope classification |

**No OSS implements a declared knowledge boundary.** This is a build area.

### Commercial landscape

| Vendor | What they do | Gap |
|---|---|---|
| **Cleanlab TLM** | Trustworthiness score; benchmarks above HHEM/Lynx/Prometheus; works with any frontier LLM, no custom model | Post-hoc; no boundary declaration |
| **Vectara HHEM** | Probabilistic factual-consistency score | Post-hoc; context-relative only |
| **Patronus Lynx** | Purpose-trained hallucination detection | Post-hoc |
| **Galileo Luna-2** | Fast inline evaluators | Post-hoc |

**Nobody in the surveyed field ships P7.** This is the most demonstrable differentiator in a sales call.

### The Knowledge Boundary

```yaml
knowledge_boundary:
  agent: sales-analytics
  systems_of_record:
    - key: salesforce.opportunities
      entity_types: [account, opportunity, pipeline]
      coverage: { from: 2019-01-01, to: now, granularity: day }
      freshness_sla: 24h
  answerable:   [fact, aggregate, trend, definition]
  unanswerable: [prediction, opinion, causal, counterfactual, personal]
  out_of_scope_topics: [hr, legal, medical, compensation]
  abstention:
    template: "I don't have {reason}. {suggestion}"
    reasons:
      future_period:   "data for a period that hasn't happened yet"
      before_coverage: "data from before {coverage_from}"
      unknown_entity:  "a record for {entity}"
      out_of_scope:    "access to {topic} information"
```

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P7-1** | **Knowledge-boundary declaration** per agent, versioned like a policy | BUILD | ✗ |
| **P7-2** | **Pre-flight answerability classification**: temporal scope, question type, entity scope, topic scope. Deterministic first, classifier second | HYBRID | ✗ |
| **P7-3** | **Forced abstention** — out-of-boundary questions answered from the template **without reaching the model** | BUILD | ✗ |
| **P7-4** | Post-flight boundary verification — numeric claims outside coverage, entities not retrieved, predictions phrased as records | BUILD | ✗ |
| **P7-5** | **Prediction/record register separation** — a forecast may be returned, but must be labelled | BUILD | ✗ |
| **P7-6** | **Over-refusal detection** — excess abstention on boundary-answerable questions raises a finding, never a block | BUILD | ✗ |
| **P7-7** | Completeness signalling — truncated retrieval must be disclosed, not answered as exhaustive | BUILD | ✗ |

### Design note
`abstain` is a new verdict inserted into the lattice between `redact` and `escalate`. It is **not** a block — it returns a helpful templated response. It ranks above redaction because it *replaces* the answer, and below escalation because it needs no human.

**Primary metric:** unanswerable-question fabrication rate → target 0.
**Guardrail metric:** false-abstention rate. P7 is one of the two pillars most capable of making an agent useless; it ships observe-first like everything else.

---

## Pillar 8 — Provenance & Source Authority

> *"How do we know it didn't use an unverified source?"*

### What it answers
*"Where did that answer come from, and was that source allowed to be the answer?"*

### Evidence
The hole this closes is in our own v1 build: the `groundedness` scorer checks the **answer against the retrieved context** and never asks whether that **context was authoritative**. An answer faithfully grounded in a deprecated 2019 wiki page scores **1.0**. That is a lab metric wearing the costume of a control.

EU AI Act **Art. 10** (data governance) and ISO 42001 **A.7** (data for AI systems) both require knowing the provenance and quality of the data a system uses.

### Industry state of the art
Grounding is a **scoring** problem in the market, not an **enforcement** one. Vectara HHEM gives a probabilistic factual-consistency score against retrieved context; Ragas computes faithfulness and context precision; Patronus Lynx detects unfaithful spans. All of them are relative to *whatever was retrieved*.

**Nobody tiers sources and enforces on the tier.** The enterprise search vendors come closest — Glean ranks and permissions by source, Elastic supports document-level security — but they govern *retrieval*, not the *answer's* right to cite what it retrieved.

The gap: **grounding ≠ authority ≠ freshness**. Three separate properties, and a real control needs all three.

### Source tiers

| Tier | Meaning | Example |
|---|---|---|
| 1 `system_of_record` | Authoritative, owned, SLA'd | Salesforce, ERP, price book |
| 2 `approved` | Curated, reviewed, owned | Published policy pages, approved KB |
| 3 `unverified` | Internal but unowned | Personal OneNote, old wiki, meeting notes |
| 4 `external` | Outside the boundary | Public web, third-party docs |

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **Ragas** | Apache-2.0 | Faithfulness, context precision/recall, answer relevancy | **REUSE ★** — the scoring substrate |
| **TruLens** | Apache-2.0 | RAG triad: groundedness, context relevance, answer relevance | **REUSE** — alternative |
| **Patronus Lynx** | Open weights | Purpose-trained faithfulness model | **REUSE** — optional scorer |
| **DeepEval** | Apache-2.0 | Faithfulness, hallucination metrics | Alternative |

### Commercial landscape

| Vendor | What they do | Gap |
|---|---|---|
| **Vectara** | HHEM factual consistency, probabilistic score | No source tiering or freshness enforcement |
| **Cleanlab** | Trustworthiness of the response | Context-relative |
| **Galileo** | Context adherence at scale | Context-relative |
| **Glean / Elastic** | Source-ranked, permissioned enterprise search | Govern retrieval, not the answer's citations |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P8-1** | **Source registry** — tier, owner, `updated_at`, refresh cadence, data classes, permitted topics | BUILD | ✗ |
| **P8-2** | **Chunk provenance** carried through the whole execution path and into the trace | BUILD | ✗ |
| **P8-3** | **Tier policy** — *"financial figures only from tier-1 sources"*; below-tier blocks, caveats or escalates | BUILD | ✗ |
| **P8-4** | **Staleness enforcement** against the source's freshness SLA | BUILD | ✗ |
| **P8-5** | **Citation binding** — decompose the answer into material claims; each must bind to a chunk that supports it | REUSE (Ragas) + BUILD | ✗ |
| **P8-6** | Uncited-assertion detection — a material claim with no supporting chunk is the fabrication signature | BUILD | ✗ |
| **P8-7** | **Conflict disclosure** — silently picking between disagreeing sources is a failure | BUILD | ✗ |
| **P8-8** | Domain binding — a support agent answering from the finance corpus is a scope failure even when correct | BUILD | ✗ |

### Design note
This is the **upgrade path for v1's differentiator**. `groundedness` becomes *one input* to an enforceable provenance control rather than a number on a dashboard. Reusing Ragas for the scoring substrate keeps our engineering on the tiering, freshness and enforcement layer — which is the part nobody sells.

---

## Pillar 9 — Action Assurance

> *"How do we know the prompt can cause destructive changes to the DB?"*

### What it answers
*"What will this action actually do?"* Blast radius before execution.

### Evidence
Execution and action failures are **up 62%** — the fastest-growing class. The reference incident: an AI coding agent connected to **production instead of staging** and wiped **1.9 million rows** of customer data, executing "flawlessly from a technical standpoint."

Our v1 containment is **argument-level** on **declared tools** (`amount < 1000`). It has nothing to say about a **generated artefact** whose destructiveness lives in its *structure*. An agent with a legitimate `db.query` tool can pass `DROP TABLE users` as a perfectly well-formed string argument.

### Industry state of the art
**The current best practice is an admission of defeat.** The prevailing advice is to point the agent at a **read-only replica**, creating "a logical and physical impossibility for DROP, DELETE, or UPDATE to succeed." That is correct and sensible — and it means the agent cannot do write work at all. It is a workaround for the absence of a control.

Where the literature *is* prescriptive, it is worth quoting precisely:

> **Deterministic code validation** — "this is not an LLM checking the SQL; it requires deterministic code with **zero false negatives**. Queries should have **comments stripped first** to expose true structure, since attacks like `SELECT * FROM users -- ; DROP TABLE users` can bypass naive keyword checks."

**Two adjacent categories do parts of this, for humans:**

- **Database access governance** — StrongDM, Teleport, Satori (Commvault), Cyral sit in front of databases and authorise at session and query level. StrongDM's MCP Gateway *"authorizes each tool call an AI agent makes before it executes, and the agent never holds a credential."*
- **Semantic-layer governance** — Dremio's framing is the sharpest architectural statement in this space: enforce access *"structurally, at the layer every query must pass through, rather than procedurally, in workflows that agents simply skip."*

**Nobody does statement-level blast-radius analysis for agents with policy expressed on estimated affected rows.** That is the gap.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **sqlglot** | **MIT** | SQL parser, transpiler, optimiser; **31 dialects**; full AST; **zero dependencies** | **REUSE ★** — the deciding factor over alternatives is zero-dependency, which preserves the air-gap install |
| **sqlparse** | BSD-3 | Non-validating SQL tokeniser | Alternative; weaker AST |
| **pglast** | GPL-3 ⚠ | libpg_query bindings, true Postgres parse tree | **EXCLUDED** — GPL is incompatible with our distribution |
| **OPA / Cedar** | Apache-2.0 | Decision engine for the resulting policy | **REUSE ★** — already in the stack |

### Commercial landscape

| Vendor | Approach | Gap |
|---|---|---|
| **StrongDM** | Proxy; MCP Gateway authorises each tool call; agent holds no credential; continuous session authorisation | Authorises the *call*, not the *statement's blast radius* |
| **Teleport** | Agentic Identity Framework; cryptographic agent identity; ephemeral isolation | Infrastructure access, not semantic analysis |
| **Satori** (Commvault) | Real-time masking and filtering by identity/role; extends to AI pipelines | Data-centric, not action-semantic |
| **Dremio** | Semantic-layer governance — structural enforcement | Analytics-layer only |
| **Kosmoy** | Kernel-enforced sandboxing, per-task credentials, kill switch | Containment by isolation, not by analysis |
| **Cisco DefenseClaw** | OpenShell isolation for agents | Limited to OpenClaw runtime |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P9-1** | **Statement parsing to an AST** via sqlglot; comments stripped pre-parse; **unparseable input fails closed** | REUSE (sqlglot) + BUILD | ✗ |
| **P9-2** | Operation classification → reversibility class (SELECT / INSERT / UPDATE / DELETE / DDL / DCL) | BUILD | ✗ |
| **P9-3** | **Stacked-statement rejection** — the primary evasion path | BUILD | ✗ |
| **P9-4** | **Unbounded-mutation detection** — no `WHERE`, or tautological predicates (`WHERE 1=1`) | BUILD | ✗ |
| **P9-5** | **Blast-radius estimation** — `EXPLAIN` where available, else cardinality metadata. **Policy written on affected rows, not argument values** | BUILD | ✗ |
| **P9-6** | **Environment binding** — a `production` target from a staging-bound agent is blocked. *This alone prevents the 1.9M-row incident* | BUILD | ✗ |
| **P9-7** | **State-verification preconditions** — a fact an irreversible action depends on is **read back from the system of record**, not taken from the model's assertion | BUILD | ✗ |
| **P9-8** | **Idempotency** — key from `(trace, tool, canonical_args)`; replay inside the window blocked as duplicate | BUILD | ✗ |
| **P9-9** | **Composed-privilege detection** — a *sequence* achieving what no single grant permits | BUILD | ✗ |
| **P9-10** | **Dry-run mode** — high-impact actions explained to an approver rather than executed | BUILD | ✗ |

### Design note — the HR incident, closed

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

The model asserts the candidate accepted. The platform **reads the record**. Record says `pending`. The email never sends.

**Non-negotiable metric:** destructive-action false-negative rate must be **0**. A control with any false negatives here is worthless — which is why P9-1 fails closed. An artefact we cannot analyse is one we cannot authorise.

---

## Pillar 10 — Entitlement & Disclosure Control

> *"The agent has an SDK for information which cannot be given."*

### What it answers
*"Is **this person** allowed to see this?"* — as distinct from "is the agent allowed to fetch it?"

### Evidence
This is the highest-value gap in the entire document. The Copilot research states it exactly:

> *"The oversharing problem represents **a governance failure rather than a security breach — every permission check passed**."*
> *"Copilot **operationalizes permission debt** already sitting in Microsoft 365."*
> *"A single prompt like 'summarize our M&A discussions from last quarter' surfaces everything the user's account has read access to, across millions of documents."*

And the market consequence: *"most tenants are not ready to safely enable Copilot because of pre-existing oversharing."* **This is why rollouts stall.** It is a problem stated in the buyer's own language, with budget already attached.

### Industry state of the art
Three responses, all partial:

1. **Remediate the permissions** — Microsoft SharePoint Advanced Management ships Data Access Governance reports and **Restricted Content Discovery** to block sites from surfacing in Copilot while permissions are fixed. Correct, but it is a data-cleanup programme measured in quarters.
2. **Document-level RBAC in the RAG pipeline** — now a named architecture pattern: carry ACLs into the index and filter at query time.
3. **Knowledge-layer access control** — **Knostic** is the pure-play: *"the world's first provider of need-to-know based access controls for LLMs,"* detecting **oversharing, undersharing and inference risks** across M365 Copilot, Glean, Gemini and custom deployments, enforcing at request time. $19.3M raised; won both RSA Launch Pad 2024 and Black Hat Startup Spotlight 2024; RSAC Innovation Sandbox.

**The unclaimed position** is the one Dremio articulates for data: enforce **structurally, at the layer every query must pass through, rather than procedurally, in workflows agents simply skip.** We already *are* that layer for every agent call.

**And P10-4 has value with no entitlement model at all.** Comparing what the agent can reach against what the caller is entitled to produces the "Copilot readiness report" continuously, instead of as a one-off consulting engagement. That is the diagnostic that *motivates* buying the rest.

### Open-source landscape

| Project | Licence | Does | Verdict |
|---|---|---|---|
| **OpenFGA** | **Apache-2.0**, CNCF incubating | Zanzibar ReBAC; **`ListObjects`** (what can this user see?) and `Check` | **REUSE ★** — `ListObjects` is exactly retrieval pre-filtering |
| **SpiceDB** (AuthZed) | Apache-2.0 | Zanzibar ReBAC, mature | Alternative |
| **Cerbos** | Apache-2.0 | Stateless PDP, policy-as-code | Alternative |
| **Cedar** | Apache-2.0 | Formally verified authz | Alternative |
| **Casbin** | Apache-2.0 | ACL/RBAC/ABAC | Simpler alternative |

This layer is **well served** — the ReBAC engines are mature, CNCF-backed and permissive. We wrap; we do not build an authorisation engine.

### Commercial landscape

| Vendor | Approach | Note |
|---|---|---|
| **Knostic** | Need-to-know access control for LLMs; oversharing, undersharing **and inference** risk; request-time enforcement | **The direct competitor for this pillar** |
| **Microsoft Purview + SharePoint Advanced Management** | DAG reports, Restricted Content Discovery, sensitivity labels | Microsoft-estate only |
| **Glean** | Permission-aware enterprise search | Search product, not a governance layer |
| **Elastic** | Document-level security | Infrastructure primitive |
| **Immuta / Privacera / Securiti** | Data access governance, dynamic masking | Data platform, not agent-aware |
| **Satori** | Real-time masking by identity/role | Database-centric |

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P10-1** | **End-user principal propagation** — subject, groups, tenant, clearance flow through gateway and SDK into retrieval and tools. *Without this, nothing else in the pillar is possible* | BUILD | ✗ |
| **P10-2** | **Retrieval pre-filtering** — compute the visible resource set (`ListObjects`) and pass it as a retrieval filter. Nothing unauthorised is ever retrieved | REUSE (OpenFGA) + BUILD | ✗ |
| **P10-3** | **Retrieval post-filtering** — `Check` each chunk, drop unauthorised, **record the drop**. Works with whatever ACLs already exist | REUSE + BUILD | ✗ |
| **P10-4** | **Over-permission detection** — agent reach vs principal entitlement; the continuous Copilot-readiness report | BUILD | ✗ |
| **P10-5** | **Cross-tenant assertion** — hard invariant, `critical`, never suppressible | BUILD | ✗ |
| **P10-6** | **Aggregation-disclosure control** — k-anonymity; a salary band over a group of one is an individual's salary | BUILD | ✗ |
| **P10-7** | Purpose limitation — GDPR Art. 5(1)(b) | BUILD | ✗ |
| **P10-8** | Restricted-content classes — MNPI, blackout periods, legal hold, clearance | BUILD | ✗ |
| **P10-9** | **Inference-disclosure detection** — output asserting a protected attribute never present in retrieval | BUILD | ✗ |

### Design note
Pre-filtering is strictly better than post-filtering and should be the default where the retriever accepts a filter. Post-filtering exists because most retrievers do not — and because **P10-3's drop count is the oversharing metric** that makes the problem visible before anyone has built an entitlement model.

---

## Pillar 11 — Escalation Governance

### What it answers
*"When must a human take over — and did we notice when we should have?"*

### Evidence
**31.1% of all catalogued failures are resolution/escalation breakdowns — the single largest class**, and v1 has zero coverage. We built HITL approvals for *policy* escalation; we have nothing that notices the agent **should have handed off and didn't**.

Observed trigger distribution in 2026 deployments:

| Trigger | Share |
|---|---|
| Low confidence score | **39%** |
| Explicit user request | 28% |
| Sentiment below threshold | 17% |
| Regulated topic | 16% |

### Industry state of the art
**The single most important insight in this document:**

> *"Most escalation advice stops at 'set a confidence threshold,' but **the confidence number being thresholded against is not trustworthy**. Models trained with RLHF are systematically miscalibrated, with their **highest verbal confidence often correlating with incorrect outputs**."*

39% of escalation triggers are built on a signal that is systematically wrong. This is a structural flaw in how the entire contact-centre AI category implements escalation.

**We already compute the correct inputs.** Groundedness, self-consistency, contract violation, behavioural-envelope deviation and the silent-failure ensemble are *external, calibrated* signals — computed from evidence rather than self-reported by the model. Pillar 4 is the right input to Pillar 11, and that connection is not available to anyone whose escalation logic lives inside the agent.

The rest of the 2026 consensus is worth stating because it sets the framing:

- The working architecture is **hybrid**: AI resolves the repetitive 40–70%, humans own escalations and edge cases, and every conversation has a clean hand-off path. Programs running a hybrid policy report **4.25/5 CSAT at 71% lower blended cost-per-resolution**.
- *"A safe handoff is not a failed deflection — it is part of a healthy resolution strategy."* Escalation is not the failure mode; **unnoticed non-escalation** is.

### Open-source landscape
**None.** No open-source project governs escalation. Sentiment classifiers exist (Hugging Face models, VADER — BSD) as inputs, nothing more.

### Commercial landscape

| Vendor | What they do | Why it is not this |
|---|---|---|
| **Sierra**, **Decagon** | Autonomous agents above the support stack; context-carrying hand-off | They *implement* escalation; nobody audits whether it should have happened |
| **Intercom Fin** | Help-desk-native agent, unified hand-off | Same — and single-vendor |
| **Cresta**, **Crescendo** | Contact-centre AI with escalation policy | Same |
| **Zendesk**, **Salesforce Agentforce** | Platform-native agents | Same |

**Every one of these is an agent platform, not a governance layer.** They ship escalation as a feature of their own agent. None can tell a *different* vendor's agent that it failed to escalate — which is exactly the neutral, cross-vendor position we occupy.

### Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| **P11-1** | **Escalation policy** — declarative `must_escalate_when`: low calibrated confidence, repeated failure, negative sentiment, regulated topic, repeated abstention, turn depth, explicit request | BUILD | ✗ |
| **P11-2** | **Escalation-failure detection** — the counterfactual: it met a condition and did not escalate. **This is the 31% control** | BUILD | ✗ |
| **P11-3** | **Turn-depth degradation** — score quality by turn index; detect the observed "step 4 collapse" | BUILD | ✗ |
| **P11-4** | **Loop-vs-escalate** — a broken loop with no hand-off is still a failed interaction; loop termination must route to a human | BUILD | ◐ loop breaking only |
| **P11-5** | **False-resolution detection** — marked resolved while signals disagree | BUILD | ✗ |
| **P11-6** | **Hand-off completeness** — transcript, retrieved sources with tiers, decisions, attempted actions, abstentions | BUILD | ✗ |
| **P11-7** | **Ownership & SLA** on every escalation, with a breach finding | BUILD | ✗ |
| **P11-8** | **Calibrated confidence** — escalation thresholds consume Pillar 4 signals, **never** model self-reported confidence | BUILD | ✗ |

### Design note
P11-8 is the requirement that makes this pillar defensible rather than a reimplementation of what Sierra and Decagon already ship. Everyone else thresholds on a number the research says is systematically miscalibrated. We threshold on evidence.

**Compliance upside:** EU AI Act **Art. 14 (human oversight)** is currently evidenced only by our approval queue. *"The system detects when a human should have been involved and was not"* is a materially stronger claim to put in front of an auditor.

---

# Part 4 — Platform requirements

These are not features. They are the difference between a demo and something that can sit in a production request path. **Nothing in Part 3 ships without them.**

| ID | Requirement | Why | Status |
|---|---|---|---|
| **PL-1** | **Streaming (SSE) with inline enforcement** | **Verified defect: `stream: true` is silently ignored and a non-streaming body returned.** Most production agents stream. Two modes: *buffered* (accumulate → enforce → release; costs first-token latency) and *windowed* (stream through, detectors on a sliding window, terminate with an error event on block). Silently degrading a streaming client is never acceptable | ✗ |
| **PL-2** | **Database migrations (Alembic)** | Today `create_all()` — a deployed instance cannot be upgraded without data loss | ✗ |
| **PL-3** | **Kill switch & quarantine** | Per-agent immediate stop; quarantine = observe-only. Reversible, audited, reachable from CLI/API/UI. **Every serious competitor has this** | ✗ |
| **PL-4** | **Agent-loop governance** | Govern the multi-turn tool loop: per-loop budgets, **cumulative taint across iterations**, depth limits, cross-iteration composed-privilege detection | ✗ |
| **PL-5** | **Async workers** | Evidence building, red-team campaigns, compliance computation and drift analysis move off the request path | ✗ |
| **PL-6** | **HA-ready persistence** | Postgres default (SQLite local only), stateless gateway, pooling, tested horizontal scale | ◐ |
| **PL-7** | **Service-level fail-open** | v1 fails open *per detector*. If the control plane itself is unreachable, the SDK and gateway must degrade to local-only enforcement and buffer telemetry — never fail the customer's agent | ✗ |

### Non-functional requirements

| ID | Requirement | Target | Status |
|---|---|---|---|
| **NFR-1** | Added inline latency | **< 100 ms p95** (Lakera's sub-50ms is the competitive bar); per-detector timeout 40 ms | ✅ 2–6 ms measured |
| **NFR-2** | Availability | No single point of failure that can take the customer's agent down | ◐ |
| **NFR-3** | Throughput | 500 rps/node sustained, stateless scale-out | ✗ untested |
| **NFR-4** | Data residency | **Zero egress by default**; air-gap installable | ✅ |
| **NFR-5** | Audit integrity | Detects insertion, deletion, reordering, mutation; independently verifiable | ✅ |
| **NFR-6** | Retention | 30 d – 7 y per data class; legal hold overrides | ◐ |
| **NFR-7** | Platform security | SOC 2 Type II path; encryption at rest/transit; **audit log must not itself become a PII liability** | ◐ |
| **NFR-8** | Time to first value | Registered agent → first blocked incident visible in **< 10 minutes**, no code change | ✅ |
| **NFR-9** | Offline operation | Full core function with no egress and no model weights | ✅ |
| **NFR-10** | Determinism | Same input + policy version + detector versions → same decision, replayable | ✅ |

### Deferred to v4 — the procurement bar

Tracked in [gap-analysis.md](gap-analysis.md) and **not in scope here**, but they gate the first enterprise contract and the SOC 2 clock is the longest pole:

SSO (OIDC/SAML) + SCIM · multi-tenancy enforcement (`org_id` exists; **0 queries filter on it**) · rate limiting · KMS/Vault for the signing key · **SOC 2 Type II** · penetration test + VDP · DPA, sub-processors, DR/RTO/RPO · operator-action audit log · writable dashboard · AWS/Azure Marketplace listing.

**11 of 14 standard procurement requirements are currently unmet.** None is individually hard; together they are the difference between a demo and a contract.

---

# Part 5 — Compliance model

## 5.1 Frameworks covered

| Framework | Why buyers ask | Our coverage |
|---|---|---|
| **EU AI Act** (Reg. 2024/1689) | Legally binding, phased — the demand pump | 36/36 controls mapped |
| **NIST AI RMF** + GenAI profile | The US baseline buyers ask you to map to | 36/36 |
| **ISO/IEC 42001** | Increasingly required *of vendors* | 31/36 |
| **SOC 2** | Why a mid-market customer buys — unblocks *their* upmarket sales | 30/36 |
| **OWASP LLM Top 10** (2025) | The security team's shared language | 8/10 |
| **OWASP Agentic T1–T15** | Agent-specific threats | 10/15 |
| **MITRE ATLAS** | SOCs already correlate on it | 8 techniques |

## 5.2 New controls introduced by Pillars 7–11

| Family | Count | Anchor mappings |
|---|---|---|
| `NOM-ANS` Answerability | 3 | EU AI Act Art. 13/15 · NIST MEASURE 2.3 · OWASP LLM09 |
| `NOM-PRV` Provenance | 4 | EU AI Act Art. 10/15 · ISO 42001 A.7 · SOC 2 CC7.2 |
| `NOM-ACT` Action assurance | 5 | EU AI Act Art. 14/15 · SOC 2 CC8.1 · OWASP LLM06 · Agentic T2/T3 · ATLAS AML.T0053 |
| `NOM-ENT` Entitlement | 4 | EU AI Act Art. 10 · GDPR Art. 5/32 · SOC 2 CC6.1/CC6.3/C1.1 · OWASP LLM02 |
| `NOM-ESC` Escalation | 2 | **EU AI Act Art. 14** · NIST GOVERN 3.2 · Agentic T10 |

Full catalog: [Appendix B](appendix-b-control-catalog.md). Machine-readable: `compliance/controls.yaml`.

## 5.3 Two disciplines that ship in the product

1. **Draft-mapping gate.** All 257 mappings load as `review_status: draft`, are badged in the UI, and are **excluded from evidence packages** until a qualified reviewer signs them off.
2. **Declared gaps.** Every framework view renders what we do *not* cover — conformity assessment (Art. 43), CE marking, EU database registration (Art. 49), ISO 42001 clauses 4–10, LLM04/LLM08, Agentic T11/T14/T15, training-time ATLAS techniques.

---

# Part 6 — Build sequence

Ordered by **value per unit of risk**, not by pillar number.

| Phase | What | Why now |
|---|---|---|
| **A** | **PL-1, PL-2, PL-3** — streaming, migrations, kill switch | Nothing ships, upgrades, or stops an incident without these |
| **B** | **Pillar 9** — action assurance | Highest severity, most deterministic to build, most demonstrable (`DROP TABLE` blocked live) |
| **C** | **Pillar 10** — entitlement | Highest commercial value; unblocks the stalled-rollout conversation. P10-4 sells even before the customer has an entitlement model |
| **D** | **Pillar 7** — answerability | Best demo; **no competitor ships it** |
| **E** | **Pillar 8** — provenance | Upgrades v1's groundedness scorer into an enforceable control |
| **F** | **Pillar 11** — escalation | Largest failure class; needs 7–10 in place to detect its conditions well |
| **G** | **PL-4 … PL-7** + Gartner-gap items (P1-8, P6-9, P6-10) | Category qualification |
| **H** | Procurement bar (v4) | SOC 2 clock starts in parallel with Phase A — it is organisational, not engineering |

---

# Part 7 — Metrics

| Pillar | Primary metric | Target |
|---|---|---|
| 1 | Agents under management; shadow-agent detection rate | — |
| 2 | Least-privilege coverage; over-privileged identity count | trending down |
| 3 | Incidents blocked; **false-block rate** | false-block → 0 |
| 4 | Eval coverage; silent-failure detection rate vs human-labelled sample | — |
| 5 | % agents traced; chain verification success; time-to-audit-evidence | 100% verify |
| 6 | Control effectiveness; frameworks supported; % ARR from compliance | — |
| 7 | **Unanswerable-question fabrication rate** | **0** |
| 8 | Unauthoritative-answer rate | < 1% of material claims |
| 9 | **Destructive-action false-negative rate** | **0 — non-negotiable** |
| 10 | Entitlement-violating disclosure rate; over-permission ratio | 0; ratio trending down |
| 11 | Missed-escalation rate; time-to-human | < 5% |
| Platform | Added p95 latency (buffered streaming) | < 150 ms |

**The two metrics that decide whether this product survives contact with users:** *false-block rate* and *false-abstention rate*. Pillars 7 and 9 are the two most capable of making an agent useless. Both ship **observe-first**, like every policy in the system.

---

# Part 8 — Risks

| # | Risk | Mitigation |
|---|---|---|
| **R1** | A funded agent-security rival (Zenity, Noma, Knostic) adds our capabilities faster than we add theirs | Keep the runtime + correctness lead; Pillars 7–9 have no competitor equivalent today |
| **R2** | **A provider bundles enough of this for free.** OpenAI Frontier already ships identity, permissions, audit and evals | Neutrality, compliance depth and tamper-evident evidence are structurally hard for a provider. Never build anything a provider could bundle as our *only* value |
| **R3** | **False blocks / false abstentions destroy trust.** A guardrail that blocks legitimate work gets turned off and never turned back on | Observe-by-default; policy simulation before enforcement; per-detector precision tracked; over-refusal detection (P7-6) as a first-class control |
| **R4** | Latency breach makes us a performance problem | Tested budget; concurrent detectors; degrade-to-observe; heuristic fast path before any model-based detector |
| **R5** | **OSS dependency changes status.** LLM Guard archived; promptfoo → OpenAI; Lakera → Check Point; Invariant → Snyk — all within 12 months | Adapter interfaces; quarterly licence/health re-verification; nothing archived, BSL, GPL or competitor-owned on a default path |
| **R6** | Regulatory dates move (they already did, via the omnibus delay) | Mappings and obligations are versioned **content**, not code |
| **R7** | Compliance content is a bottomless pit | Capped per phase, driven by design-partner demand; ship packs, not bespoke mappings |
| **R8** | **Our audit log becomes a new PII liability** — we would centralise exactly the data customers fear leaking | Redaction at capture; residency by default; customer-held signing key |
| **R9** | **The market is small today** — ~$750M on dedicated agents | Accepted. This is an early-market bet on a growing pain. Revenue-timing risk, not thesis risk |
| **R10** | **Microsoft wins agent identity.** Entra Agent ID brings 20 years of IGA to agents | Do not compete on generic NHI. Compete on the clause they do not model: capability scoped by **argument provenance** |
| **R11** | Blast-radius estimation is wrong and blocks legitimate work | Advisory unless `EXPLAIN` available; default to escalate not block; dry-run gives the approver the plan |
| **R12** | P10 requires an entitlement model most customers lack | Post-filtering works with existing ACLs; **P10-4 has value with no model at all** — it is the diagnostic that motivates the work |

## Open decisions

1. **~~Vertical vs horizontal~~** — **resolved: horizontal.** Policy packs (P6-7) remain the mechanism if a vertical emerges from design partners.
2. **~~promptfoo~~** — **resolved: dropped from the critical path**, retained as an optional adapter marked `REFERENCE ⚠`.
3. **Sandboxing (P9 adjacent)** — deliberately *not* built. XL effort, defended by Kosmoy/Cisco, and the failure data says analysis beats isolation for our buyer. Revisit if a design partner demands it.
4. **Real-time evaluator adapters** (Cleanlab TLM, Vectara HHEM) — P4-9 is specified but unsequenced. Decide after Phase E whether to wrap or extend our own.

---

# Part 9 — Reference bibliography

## Market & failure data
- Menlo Ventures, *State of Generative AI in the Enterprise 2025* — spend, agent share, provider mix
- Bessemer, *AI Infrastructure Roadmap 2026* — memory/context thesis; "78% invisible failures" (citing the WildChat study)
- LangChain, *State of Agent Engineering* (n=1,340) — eval adoption, barriers
- Cleanlab, *AI Agents in Production 2025* (n=1,837) — production-live screen
- [Enterprise AI failures shifting beyond hallucinations](https://www.prnewswire.com/news-releases/new-research-finds-enterprise-ai-failures-are-shifting-beyond-hallucinations-as-companies-move-from-chatbots-to-agents-302837907.html) — **ChatSee, 10,000+ events: 31.1% escalation, +62% execution, <10% hallucination**
- [AI Incidents H1 2026 retrospective](https://www.digitalapplied.com/blog/ai-incidents-h1-2026-retrospective-failure-modes-analysis) · [Enterprise agent failure modes](https://thoughtminds.ai/blog/enterprise-ai-agent-failure-modes) · [Production failures — enterprise lessons](https://www.openempower.com/blog/ai-agent-production-failures-enterprise-lessons-2026)

## Competitive landscape
- [Arthur — Best AI Agent Security Platforms 2026](https://www.arthur.ai/column/best-ai-agent-security-platforms-2026)
- [Kosmoy — Best AI Agent Governance Platforms 2026](https://www.kosmoy.com/resources/blog/best-ai-agent-governance-platforms-2026/) · [Best AI Governance Platforms 2026](https://www.kosmoy.com/resources/blog/best-ai-governance-platforms-2026/)
- [Modulos — AI governance buyer's guide](https://www.modulos.ai/best-ai-governance-platforms/)
- [MarkTechPost — LLM observability & evaluation platforms 2026](https://www.marktechpost.com/2026/08/09/top-llm-observability-and-evaluation-platforms-in-2026-langfuse-langsmith-braintrust-arize-and-more-compared/) · [Braintrust — AI observability buyer's guide](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)

## Analyst
- [Gartner Magic Quadrant for AI Governance Platforms](https://www.gartner.com/en/documents/8006369) — first edition, 16 Jun 2026, 13 vendors
- [IBM — recognised as a Leader](https://www.ibm.com/new/announcements/ibm-recognized-as-a-leader-in-gartner-magic-quadrant-for-ai-governance-platforms)

## Consolidation & platform risk
- [OpenAI to acquire Promptfoo](https://openai.com/index/openai-to-acquire-promptfoo/) · [Promptfoo — joining OpenAI](https://www.promptfoo.dev/blog/promptfoo-joining-openai/) · [CNBC](https://www.cnbc.com/2026/03/09/open-ai-cybersecurity-promptfoo-ai-agents.html)
- [Check Point acquires Lakera](https://www.checkpoint.com/press-releases/check-point-acquires-lakera-to-deliver-end-to-end-ai-security-for-enterprises/) · [CSO Online](https://www.csoonline.com/article/4058653/check-point-acquires-lakera-to-build-a-unified-ai-security-stack.html)
- [OpenAI Frontier — enterprise agent platform](https://www.digitalapplied.com/blog/openai-frontier-enterprise-ai-agent-platform-guide)
- [Microsoft Entra Agent ID](https://learn.microsoft.com/en-us/entra/agent-id/what-is-microsoft-entra-agent-id) · [Entra ID Governance for agents](https://learn.microsoft.com/en-us/entra/id-governance/agent-id-governance-overview) · [Agent 365 — June 2026](https://techcommunity.microsoft.com/blog/agent-365-blog/whats-new-in-agent-365-%E2%80%93-june-2026/4535107)

## Pillar 7 — Answerability & abstention
- [AbstentionBench — reasoning LLMs fail on unanswerable questions](https://arxiv.org/html/2506.09038v1) — 20 datasets, 35k+ queries; **reasoning fine-tuning degrades abstention**
- [Know Your Limits — a survey of abstention in LLMs (TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00754/131566/Know-Your-Limits-A-Survey-of-Abstention-in-Large)
- [The unexpected downside of RAG — over-refusal](https://www.bohrium.com/en/blog/research-notes/aaai-2026-retrieval-augmented-models-dont-know/)

## Pillar 8 — Provenance & hallucination detection
- [Cleanlab — real-time evaluation models for RAG: who detects hallucinations best?](https://cleanlab.ai/blog/rag-evaluation-models/) — TLM vs HHEM vs Lynx vs Prometheus 2
- [Cleanlab — benchmarking hallucination detection in RAG](https://cleanlab.ai/blog/rag-tlm-hallucination-benchmarking/)
- [Vectara — next generation of the Hallucination Leaderboard](https://www.vectara.com/blog/introducing-the-next-generation-of-vectaras-hallucination-leaderboard)

## Pillar 9 — Action assurance
- [Protect production SQL databases from agentic query risks](https://rietta.com/blog/ai-sql-database-data-protection-read-replica/) — read-replica pattern
- [Production-ready text-to-SQL: 9 problems with fixes](https://atalupadhyay.wordpress.com/2026/07/01/building-a-production-ready-text-to-sql-ai-agent-9-problems-with-fixes/) — **deterministic validation, comments stripped first**
- [AI agent database wipe — lessons](https://www.mindstudio.ai/blog/ai-agent-database-wipe-disaster-lessons/) — the 1.9M-row incident
- [Testing SQL agents — safety & query validation](https://langwatch.ai/scenario/testing-guides/sql-agent/)
- [Teleport — agentic AI security](https://goteleport.com/use-cases/agentic-ai/) · [StrongDM](https://www.strongdm.com/) · [Dremio — semantic layer governance](https://www.dremio.com/blog/semantic-layer-governance-control-what-ai-agents-access/)
- [SQLGlot](https://www.tobikodata.com/sqlglot) — MIT, 31 dialects, zero dependencies

## Pillar 10 — Entitlement & disclosure
- [M365 Copilot oversharing — what IAM and data teams must fix](https://nhimg.org/community/cybersecurity-beyond-identity/microsoft-365-copilot-oversharing-what-iam-and-data-teams-must-fix/)
- [Copilot didn't overshare your data, your permissions did](https://petri.com/copilot-didnt-overshare-your-data-your-permissions-did/)
- [Microsoft — mitigate oversharing for Copilot and agents](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/mitigate-oversharing-to-govern-microsoft-365-copilot-and-agents/4448744)
- [Knostic — need-to-know access controls for LLMs](https://www.knostic.ai/what-we-do) · [Knostic review 2026](https://appsecsanta.com/knostic)
- [Document-level RBAC for RAG pipelines](https://truto.one/blog/how-to-maintain-document-level-rbac-in-enterprise-rag-pipelines/)
- [OpenFGA](https://openfga.dev/) — Apache-2.0, CNCF incubating, Zanzibar ReBAC

## Pillar 11 — Escalation
- [Human-in-the-loop escalation design for AI agents 2026](https://www.digitalapplied.com/blog/human-in-the-loop-escalation-design-ai-agents-2026) — **trigger distribution; RLHF miscalibration**
- [Agent-to-human handoff patterns](https://zylos.ai/research/2026-04-03-agent-to-human-handoff-patterns/)
- [AI confidence thresholds: when to escalate](https://myaskai.com/blog/ai-confidence-thresholds-handoff)
- [Decagon — what is an AI escalation policy](https://decagon.ai/glossary/what-is-an-ai-escalation-policy) · [Sierra vs Decagon](https://quiq.com/blog/sierra-ai-vs-decagon/)

## Regulatory & standards
EU AI Act (Reg. (EU) 2024/1689), post-omnibus timeline · NIST AI RMF 1.0 + Generative AI Profile (NIST-AI-600-1) · ISO/IEC 42001:2023 Annex A · AICPA SOC 2 Trust Services Criteria · OWASP Top 10 for LLM Applications 2025 · OWASP Agentic AI Threats & Mitigations (T1–T15) · MITRE ATLAS · NIST OSCAL

## Procurement
[Konfirmity — SOC 2 customer security questionnaire](https://www.konfirmity.com/blog/soc-2-customer-security-questionnaire) · [Workstreet — security compliance questionnaires](https://www.workstreet.com/blog/security-compliance-questionnaires) · [Copla — vendor security assessment](https://copla.com/blog/third-party-risk-management/guide-to-vendor-security-and-risk-assessment-questionnaires/)

---

## Caveats on all of the above

**Survey data is directional, not census-grade.** Adoption and pain figures come from vendor-run surveys of self-selected agent builders — which is why production-adoption estimates range from 5.2% to 57% depending on who screened.

**Competitor capability claims come from 2026 buyer guides and vendor material and shift fast.** Seven acquisitions in this document closed within twelve months. Validate before positioning against a named rival.

**Regulatory dates reflect the post-omnibus schedule** and remain subject to EU adjustment.

**OSS licence and maintenance status change quickly.** Two projects on our original critical path changed status within a year. Re-verify every dependency's LICENSE file and last-commit date **quarterly** — this is a standing obligation, not advice.

**Framework mappings in this product are engineering drafts, not legal advice**, and are excluded from evidence packages until reviewed by qualified counsel.
