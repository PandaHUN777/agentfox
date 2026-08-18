# Business Failure-Mode Analysis — where deployed agents actually break

**Companion to [gap-analysis.md](gap-analysis.md).** That document benchmarked us against vendor feature lists. This one benchmarks us against **how enterprise agents actually fail in production** — which turns out to be a very different, and more useful, target.

---

## The finding that reframes the roadmap

A study of **10,000+ AI failure events** (ChatSee, published Jul 2026) found:

| Failure class | Share |
|---|---|
| **Resolution / escalation breakdowns** | **31.1%** |
| Execution and action failures | **up 62%** vs Q2-2024 baseline |
| **Hallucination-related** | **< 10%** |

Supporting figures: **88% of organisations had at least one AI agent security incident in 2025**; only **~10% of agent pilots reach production**; **fewer than 25%** of enterprises running multi-agent pilots report confidence in reliability or governance.

**What this means for us, bluntly:** our Pillar 4 flagship — silent-failure detection — is aimed at the **smallest** slice of the problem. It is still worth having, and it is still differentiated. But we built a sophisticated answer to <10% of failures while having **nothing at all** for the 31% (escalation breakdown) and the fastest-growing category (execution/action).

The rest of this document is the failure taxonomy we should actually be governing.

---

## Named incidents worth designing against

| Incident | What happened | What would have caught it |
|---|---|---|
| **AI coding agent wipes 1.9M rows** (2024) | Agent connected to **production instead of staging** and executed deletion tasks "flawlessly from a technical standpoint" | Environment binding on the tool target + destructive-statement analysis |
| **Finance reconciliation agent** | "Confirmed" a transaction matched by **hallucinating the matching record**. Not caught until month-end close | Claim-to-record verification: any asserted fact about a record must resolve against the record |
| **HR onboarding agent** | Sent a welcome email to a candidate who **had not accepted the offer** — hallucinated the acceptance status | Irreversible action gated on **verified** state, not asserted state |
| **M365 Copilot oversharing** | *"a governance failure rather than a security breach — every permission check passed."* One prompt (*"summarise our M&A discussions last quarter"*) surfaces everything the account can read | End-user entitlement propagation + retrieval-scope enforcement |
| **Sales qualification agent** | Hallucinates objection responses **after step four** of the conversation | Turn-depth degradation monitoring |
| **Scheduling agent** | Loops indefinitely when the caller deviates from the expected script | Escalation-failure detection (we have loop breaking, not escalation logic) |

---

## The taxonomy — 7 failure families, 34 modes

Legend: ✅ covered · ◐ partial · ✗ absent (all verified against the codebase).

### F1 — Answerability & abstention
*"If someone asks for future sales, the answer should be 'data not available', not a generated one."*

The research is unambiguous that this is unsolved: **AbstentionBench** (20 datasets, 35k+ unanswerable queries) finds that **reasoning fine-tuning often *degrades* abstention** — newer, more capable models are *worse* at saying "I don't know". And the inverse failure is real too: retrieval noise causes **over-refusal**, where the model refuses questions it could answer.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F1.1 | **Answers an unknowable question** | "What will Q4 2027 revenue be?" → generates a number | ✗ |
| F1.2 | **Answers outside the data coverage window** | Index holds 24 months; asked about 5 years ago | ✗ |
| F1.3 | **Answers for an entity not in scope** | Customer not in the CRM → invents a record | ✗ |
| F1.4 | **Prediction presented as record** | Forecast stated in the same register as an actual | ✗ |
| F1.5 | **Over-refusal** | Refuses something it can and should answer; kills adoption | ✗ |
| F1.6 | **Partial answer presented as complete** | Retrieved 3 of 50 relevant docs, answers as if exhaustive | ✗ |

**What's needed:** a declared **knowledge boundary** per agent — which systems of record it can reach, what time range, which entity scopes, and which question *types* are answerable (fact / aggregate / prediction / opinion). A pre-flight **answerability classifier** routes unanswerable questions to a templated abstention **before generation**. Post-flight, verify the answer did not exceed the boundary.

This is a control nobody in the competitive set ships. It is directly sellable: *"your agent will say 'I don't have that' instead of inventing it."*

### F2 — Source authority & provenance
*"How do we know it didn't use an unverified source?"*

Our `groundedness` scorer checks the **answer against the retrieved context**. It never asks whether that **context was authoritative**. An agent that faithfully grounds an answer in a deprecated 2019 wiki page scores 1.0.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F2.1 | **Unauthoritative source** | Answers a pricing question from a personal OneNote, not the price book | ✗ |
| F2.2 | **Stale source** | Policy changed last week; index is a month old | ✗ |
| F2.3 | **Fabricated citation** | Cites a document that does not contain the claim | ◐ groundedness only |
| F2.4 | **Contradictory sources, silent pick** | Two docs disagree; agent picks one, never says so | ✗ |
| F2.5 | **Uncited assertion** | Material claim with no source at all | ✗ |
| F2.6 | **Source outside the agent's declared domain** | Support agent answering from the finance corpus | ✗ |

**What's needed:** every retrieved chunk carries **source tier** (system-of-record / approved / unverified / external), **freshness**, and **owner**. Policy expressed as: *"financial figures may only be sourced from tier-1 systems of record less than 24h old; anything else must be caveated or blocked."* Then **citation binding** — each material claim must map to a chunk, and the chunk must actually support it.

### F3 — Destructive & irreversible actions
*"How do we know the prompt can cause destructive changes to the DB?"*

Our containment is **argument-level** on **declared tools** (`amount < 1000`). It has nothing to say about a **generated artefact** — SQL, a script, an API body — whose destructiveness lives in its *structure*, not its arguments.

The research is specific about how to do this correctly: **deterministic parsing, not an LLM checking the SQL**, with **zero false negatives**, and **comments stripped first** — because `SELECT * FROM users -- ; DROP TABLE users` defeats naive keyword matching.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F3.1 | **Destructive DML** | `DELETE FROM orders` with no `WHERE` | ✗ |
| F3.2 | **DDL / schema change** | `DROP TABLE`, `TRUNCATE`, `ALTER` | ✗ |
| F3.3 | **Unbounded blast radius** | `UPDATE` matching 1.2M rows | ✗ |
| F3.4 | **Wrong environment** | Ran against prod, not staging — *the 1.9M-row incident* | ✗ |
| F3.5 | **Comment/stacked-statement evasion** | `-- ; DROP TABLE` | ✗ |
| F3.6 | **Irreversible act on unverified state** | Welcome email on a hallucinated acceptance | ✗ |
| F3.7 | **Duplicate execution on retry** | Same refund issued twice | ✗ |
| F3.8 | **Composed privilege escalation** | Read tool + write tool chained into something neither permits | ✗ |
| F3.9 | **Cascading side effects** | One write fires webhooks/automations | ✗ |
| F3.10 | **Partial completion, no rollback** | Multi-step action half-applied | ✗ |

**What's needed:** an **action-semantics analyser** — deterministic parse of generated SQL (and later: shell, HTTP, code), classified into operation, targets, estimated affected rows, reversibility, and environment. Policy on **blast radius**, not on argument values. Plus environment binding on the *tool target*, idempotency keys on irreversible tools, and a **state-verification precondition** — the fact an irreversible action depends on must be read back from the system of record, not taken from the model's assertion.

### F4 — Entitlement & disclosure
*"The agent has an SDK for information that must not be given."*

The Copilot research puts it exactly right: **"a governance failure rather than a security breach — every permission check passed."** The agent runs with its own service identity and inherits the union of everything it can reach. Nothing checks what **this requesting human** is entitled to.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F4.1 | **Oversharing via retrieval** | Employee asks about salaries; index has HR docs; every ACL passes | ✗ |
| F4.2 | **Agent identity ≠ user entitlement** | Agent's service account is broader than the caller | ✗ |
| F4.3 | **Cross-tenant leakage** | Multi-tenant app, tenant A sees tenant B | ✗ |
| F4.4 | **Aggregation disclosure** | Salary band + headcount of 1 → an individual's salary | ✗ |
| F4.5 | **Inference disclosure** | Model infers a protected attribute never stored | ✗ |
| F4.6 | **Purpose limitation breach** | Support data reused for marketing (GDPR Art. 5) | ✗ |
| F4.7 | **MNPI / blackout / legal hold** | Agent surfaces material non-public information | ✗ |
| F4.8 | **Residency violation** | EU subject data answered from a US context | ◐ deployment only |

**What's needed:** propagate the **end-user principal** through the agent to retrieval and tools; enforce that responses only contain what that principal is entitled to see; detect **over-permissioned retrieval** (agent could reach more than the caller); and add k-anonymity-style checks for aggregation disclosure. This is the single highest-value gap commercially — it is the reason Copilot rollouts stall.

### F5 — Escalation & resolution breakdown — **31.1% of all failures**

The largest category, and we have **zero** coverage. We have HITL approvals for *policy* escalation; we have nothing that notices the agent **should have handed off and didn't**.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F5.1 | **Failed to escalate** | Kept trying instead of handing to a human | ✗ |
| F5.2 | **Escalated without context** | Human receives a ticket with no history | ✗ |
| F5.3 | **Loops instead of escalating** | Scheduling agent when the caller goes off-script | ◐ loop *breaking* only |
| F5.4 | **Turn-depth degradation** | Quality collapses after step 4 | ✗ |
| F5.5 | **False resolution** | Marks resolved without resolving | ✗ |
| F5.6 | **Dropped hand-off** | Escalation raised, nobody owns it, no SLA | ✗ |
| F5.7 | **Sentiment/urgency blindness** | Misses a distressed or legally-charged user | ✗ |

**What's needed:** an **escalation policy** per agent (conditions that *must* trigger hand-off: low confidence, repeated failure, user frustration, out-of-scope, regulated topic), detection of the **counterfactual** ("this should have escalated"), context-complete hand-off packages, and ownership + SLA on the queue.

### F6 — Commitment, advice & liability

| # | Failure mode | Example | Status |
|---|---|---|---|
| F6.1 | **Binding commitment** | Promises a refund/discount/SLA the company must honour | ✗ |
| F6.2 | **Unlicensed advice** | Financial, medical or legal advice | ◐ safety lexicon only |
| F6.3 | **Missing AI disclosure** | EU AI Act Art. 50 | ✗ |
| F6.4 | **Adverse action, no reason** | Denial without explanation (FCRA/ECOA) | ✗ |
| F6.5 | **Discriminatory outcome** | Screening bias | ✗ |
| F6.6 | **Decision not recorded** | No auditable basis for a regulated decision | ✅ |

### F7 — Numeric, temporal & entity integrity

| # | Failure mode | Example | Status |
|---|---|---|---|
| F7.1 | **Hallucinated record match** | *The reconciliation incident* | ✗ |
| F7.2 | **Arithmetic / aggregation error** | Sum doesn't match the rows cited | ✗ |
| F7.3 | **Wrong period** | Fiscal vs calendar year | ✗ |
| F7.4 | **Unit / currency error** | USD vs EUR, thousands vs millions | ✗ |
| F7.5 | **Entity confusion** | Right answer, wrong customer | ✗ |
| F7.6 | **Timezone error** | Off-by-one day on a deadline | ✗ |
| F7.7 | **Self-contradiction across turns** | Contradicts its own earlier answer | ✗ |

---

## Coverage summary

| Family | Modes | ✅ | ◐ | ✗ | Share of real-world failures |
|---|---|---|---|---|---|
| F1 Answerability & abstention | 6 | 0 | 0 | 6 | high — drives F2/F7 |
| F2 Source authority | 6 | 0 | 1 | 5 | high |
| F3 Destructive actions | 10 | 0 | 0 | 10 | **fastest-growing (+62%)** |
| F4 Entitlement & disclosure | 8 | 0 | 1 | 7 | **highest commercial value** |
| F5 Escalation breakdown | 7 | 0 | 1 | 6 | **31.1% — largest single class** |
| F6 Commitment & liability | 6 | 1 | 1 | 4 | high severity, low frequency |
| F7 Numeric & entity integrity | 7 | 0 | 0 | 7 | high in finance/ops |
| **Total** | **50** | **1** | **4** | **45** | |

**We cover 1 of 50 outright.** The four partials are groundedness, loop breaking, the safety lexicon, and deployment-level residency.

That number is not as damning as it looks — the pillars we built (taint containment, audit chain, policy engine, computed control status) are the **substrate** these controls run on. Every item above is expressible as a detector, a policy condition, or a scorer in the architecture that already exists. What we did not do is aim them at the failures businesses actually experience.

---

## What this implies for the build

Four new capability areas, in commercial-value order. Each maps onto existing interfaces (`Detector`, `PolicyEngine`, `Scorer`) rather than requiring new architecture.

1. **Entitlement-aware data access (F4)** — end-user principal propagation, retrieval-scope enforcement, over-permission detection. *Unblocks the Copilot-class rollout stall. Highest willingness to pay.*
2. **Action semantics & blast radius (F3)** — deterministic SQL/artefact parsing, environment binding, state-verification preconditions, idempotency. *Prevents the incident that makes the news.*
3. **Answerability & abstention (F1)** — knowledge-boundary declaration, pre-flight answerability routing, forced abstention. *The most demonstrable in a sales call, and nobody else ships it.*
4. **Source authority & citation binding (F2)** — source tiers, freshness, citation verification. *Turns our groundedness scorer from a lab metric into an enforceable control.*

Then **escalation governance (F5)** — largest failure class, moderate build, and it converts our existing HITL queue into a product rather than a plumbing detail.

Deferred: F6 and F7 are real but narrower; F7 in particular needs per-domain work that a horizontal product should offer as a policy pack, not as core.

---

## Sources

[Morningstar/PR Newswire — enterprise AI failures shifting beyond hallucinations (ChatSee, 10k+ events)](https://www.prnewswire.com/news-releases/new-research-finds-enterprise-ai-failures-are-shifting-beyond-hallucinations-as-companies-move-from-chatbots-to-agents-302837907.html) · [AI Incidents H1 2026 retrospective](https://www.digitalapplied.com/blog/ai-incidents-h1-2026-retrospective-failure-modes-analysis) · [Enterprise AI agent failure modes](https://thoughtminds.ai/blog/enterprise-ai-agent-failure-modes) · [AI agent production failures — enterprise lessons](https://www.openempower.com/blog/ai-agent-production-failures-enterprise-lessons-2026)

[M365 Copilot oversharing — what IAM and data teams must fix](https://nhimg.org/community/cybersecurity-beyond-identity/microsoft-365-copilot-oversharing-what-iam-and-data-teams-must-fix/) · [Copilot didn't overshare your data, your permissions did](https://petri.com/copilot-didnt-overshare-your-data-your-permissions-did/) · [Microsoft — mitigate oversharing for Copilot and agents](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/mitigate-oversharing-to-govern-microsoft-365-copilot-and-agents/4448744)

[Protect production SQL databases from agentic query risks](https://rietta.com/blog/ai-sql-database-data-protection-read-replica/) · [Production-ready text-to-SQL: 9 problems with fixes](https://atalupadhyay.wordpress.com/2026/07/01/building-a-production-ready-text-to-sql-ai-agent-9-problems-with-fixes/) · [AI agent database wipe — lessons](https://www.mindstudio.ai/blog/ai-agent-database-wipe-disaster-lessons/) · [Testing SQL agents — safety & query validation](https://langwatch.ai/scenario/testing-guides/sql-agent/)

[AbstentionBench — reasoning LLMs fail on unanswerable questions](https://arxiv.org/html/2506.09038v1) · [Know Your Limits — a survey of abstention in LLMs (TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00754/131566/Know-Your-Limits-A-Survey-of-Abstention-in-Large) · [The unexpected downside of RAG — over-refusal](https://www.bohrium.com/en/blog/research-notes/aaai-2026-retrieval-augmented-models-dont-know/)
