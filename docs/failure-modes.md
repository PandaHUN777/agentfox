# Business Failure-Mode Analysis — where deployed agents actually break

**Companion to [gap-analysis.md](gap-analysis.md).** That document benchmarked us against vendor feature lists. This one benchmarks us against **how enterprise agents actually fail in production** — which turns out to be a very different, and more useful, target.

**Update, 2026-08-29:** the taxonomy below was written 2026-08-18 against an 18.7k-LOC codebase that covered 1 of 50 modes. Since then the codebase grew to 50k+ LOC / 1,131 tests, and a grep/execution-verified re-audit (methodology unchanged: every status below is either a passing test or a direct code citation, not an inference) found **40 of 50 modes now ✅, 8 ◐, 2 still ✗** (F3.8 composed privilege escalation, F7.7 cross-turn self-contradiction). One new status appears for the first time: **◐-unwired** — real, unit-tested logic that is never called from the live enforcement path (`enforcement.py`, `gateway/app.py`, `guardrails/pipeline.py`, or any gateway route), so it does nothing for a production request today despite passing its own tests. That is a distinct, worse state than a normal ◐ partial, and it applies to all of F6.

---

## The finding that reframes the roadmap

A study of **10,000+ AI failure events** (ChatSee, published Jul 2026) found:

| Failure class | Share |
|---|---|
| **Resolution / escalation breakdowns** | **31.1%** |
| Execution and action failures | **up 62%** vs Q2-2024 baseline |
| **Hallucination-related** | **< 10%** |

Supporting figures: **88% of organisations had at least one AI agent security incident in 2025**; only **~10% of agent pilots reach production**; **fewer than 25%** of enterprises running multi-agent pilots report confidence in reliability or governance.

**What this meant for us at the time (2026-08-18):** our Pillar 4 flagship — silent-failure detection — was aimed at the **smallest** slice of the problem, while we had **nothing at all** for the 31% (escalation breakdown) or the fastest-growing category (execution/action). That gap is now substantially closed — see the 2026-08-29 update below and the coverage summary — but the taxonomy itself, and the reasoning for why it's the right one to govern against, hasn't changed.

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

## The taxonomy — 7 failure families, 50 modes

Legend: ✅ covered · ◐ partial · ◐-unwired real logic, tested, but not called from the live request path · ✗ absent (all verified against the codebase, 2026-08-29).

### F1 — Answerability & abstention
*"If someone asks for future sales, the answer should be 'data not available', not a generated one."*

The research is unambiguous that this is unsolved: **AbstentionBench** (20 datasets, 35k+ unanswerable queries) finds that **reasoning fine-tuning often *degrades* abstention** — newer, more capable models are *worse* at saying "I don't know". And the inverse failure is real too: retrieval noise causes **over-refusal**, where the model refuses questions it could answer.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F1.1 | **Answers an unknowable question** | "What will Q4 2027 revenue be?" → generates a number | ✅ |
| F1.2 | **Answers outside the data coverage window** | Index holds 24 months; asked about 5 years ago | ✅ |
| F1.3 | **Answers for an entity not in scope** | Customer not in the CRM → invents a record | ✅ |
| F1.4 | **Prediction presented as record** | Forecast stated in the same register as an actual | ✅ |
| F1.5 | **Over-refusal** | Refuses something it can and should answer; kills adoption | ✅ |
| F1.6 | **Partial answer presented as complete** | Retrieved 3 of 50 relevant docs, answers as if exhaustive | ✅ |

**Built:** `src/nometria/answerability.py` — a declared knowledge boundary per agent (systems of record, time range, entity scope, answerable question types), a pre-flight answerability classifier that routes unanswerable questions to templated abstention before generation, and a post-flight check that the answer stayed inside the declared boundary. All six modes have passing tests.

This is a control almost nobody in the competitive set ships, and it's now real, not aspirational. It is directly sellable: *"your agent will say 'I don't have that' instead of inventing it."*

### F2 — Source authority & provenance
*"How do we know it didn't use an unverified source?"*

Our `groundedness` scorer checks the **answer against the retrieved context**. It never asks whether that **context was authoritative**. An agent that faithfully grounds an answer in a deprecated 2019 wiki page scores 1.0.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F2.1 | **Unauthoritative source** | Answers a pricing question from a personal OneNote, not the price book | ✅ |
| F2.2 | **Stale source** | Policy changed last week; index is a month old | ✅ |
| F2.3 | **Fabricated citation** | Cites a document that does not contain the claim | ✅ |
| F2.4 | **Contradictory sources, silent pick** | Two docs disagree; agent picks one, never says so | ✅ |
| F2.5 | **Uncited assertion** | Material claim with no source at all | ✅ |
| F2.6 | **Source outside the agent's declared domain** | Support agent answering from the finance corpus | ✅ |

**Built:** `src/nometria/provenance.py` — every retrieved chunk carries a source tier (system-of-record / approved / unverified / external), freshness, and owner. Policy is expressed as e.g. *"financial figures may only be sourced from tier-1 systems of record less than 24h old."* Citation binding checks that each material claim maps to a chunk that actually supports it, catching fabricated citations and silent picks between contradictory sources — this turns the old groundedness-only scorer into an enforceable control, not just a lab metric.

### F3 — Destructive & irreversible actions
*"How do we know the prompt can cause destructive changes to the DB?"*

Our containment is **argument-level** on **declared tools** (`amount < 1000`). It has nothing to say about a **generated artefact** — SQL, a script, an API body — whose destructiveness lives in its *structure*, not its arguments.

The research is specific about how to do this correctly: **deterministic parsing, not an LLM checking the SQL**, with **zero false negatives**, and **comments stripped first** — because `SELECT * FROM users -- ; DROP TABLE users` defeats naive keyword matching.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F3.1 | **Destructive DML** | `DELETE FROM orders` with no `WHERE` | ✅ |
| F3.2 | **DDL / schema change** | `DROP TABLE`, `TRUNCATE`, `ALTER` | ✅ |
| F3.3 | **Unbounded blast radius** | `UPDATE` matching 1.2M rows | ✅ |
| F3.4 | **Wrong environment** | Ran against prod, not staging — *the 1.9M-row incident* | ✅ |
| F3.5 | **Comment/stacked-statement evasion** | `-- ; DROP TABLE` | ✅ |
| F3.6 | **Irreversible act on unverified state** | Welcome email on a hallucinated acceptance | ✅ |
| F3.7 | **Duplicate execution on retry** | Same refund issued twice | ✅ |
| F3.8 | **Composed privilege escalation** | Read tool + write tool chained into something neither permits | ✗ |
| F3.9 | **Cascading side effects** | One write fires webhooks/automations | ✅ |
| F3.10 | **Partial completion, no rollback** | Multi-step action half-applied | ✅ |

**Built:** `src/nometria/guardrails/actions.py`, `enforcement.py`, `effects.py` — a deterministic action-semantics analyser, using sqlglot AST parsing (not an LLM checking its own SQL), classifies generated SQL into operation, targets, estimated affected rows, reversibility, and environment; detects tautology-as-unbounded-`WHERE`, stacked-statement and comment evasion; enforces environment binding on the tool target; and gates irreversible actions on state read back from the system of record rather than the model's assertion. This directly validates the priority the codebase already places on DB/action safety over generic injection detection.

**Still open — F3.8, composed privilege escalation:** genuinely absent. Nothing today detects a read tool's output being chained into a write/authorization boundary neither tool alone permits (e.g. a read tool surfaces an internal ID, which a second, differently-scoped tool then accepts as if it were user-supplied and authorized). This needs cross-tool data-flow tracking at the orchestration layer, not per-tool argument checks — flagged as a real, unaddressed gap, not a rounding error.

### F4 — Entitlement & disclosure
*"The agent has an SDK for information that must not be given."*

The Copilot research puts it exactly right: **"a governance failure rather than a security breach — every permission check passed."** The agent runs with its own service identity and inherits the union of everything it can reach. Nothing checks what **this requesting human** is entitled to.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F4.1 | **Oversharing via retrieval** | Employee asks about salaries; index has HR docs; every ACL passes | ✅ |
| F4.2 | **Agent identity ≠ user entitlement** | Agent's service account is broader than the caller | ✅ |
| F4.3 | **Cross-tenant leakage** | Multi-tenant app, tenant A sees tenant B | ✅ |
| F4.4 | **Aggregation disclosure** | Salary band + headcount of 1 → an individual's salary | ✅ |
| F4.5 | **Inference disclosure** | Model infers a protected attribute never stored | ✅ |
| F4.6 | **Purpose limitation breach** | Support data reused for marketing (GDPR Art. 5) | ✅ |
| F4.7 | **MNPI / blackout / legal hold** | Agent surfaces material non-public information | ◐ |
| F4.8 | **Residency violation** | EU subject data answered from a US context | ✅ |

**Built:** `src/nometria/entitlement.py`, `src/nometria/tenancy.py` — the end-user principal is propagated through the agent to retrieval and tools; responses are checked against what that principal is entitled to see; over-permissioned retrieval (agent could reach more than the caller) is detected; tenant isolation is now enforced structurally at the session level via `with_loader_criteria` rather than per-query filters (previously the single most-cited multi-tenancy gap in gap-analysis.md — now closed and enforced by construction, not convention).

**F4.7 stays ◐:** the entitlement mechanism itself is generic and works for any named sensitivity class, but only `mnpi` and `pii_sensitive` are exercised by name in tests today — a real legal-hold/blackout-list class hasn't been wired through end to end, so treat this as "the plumbing exists, the specific class isn't proven live" rather than absent.

This remains the single highest-value gap commercially — it is the reason Copilot rollouts stall — and it is now a genuine strength, not a plan.

### F5 — Escalation & resolution breakdown — **31.1% of all failures**

The largest category by real-world share (31.1%), and the one that saw the most build-out since the original audit. We went from **zero** coverage to a dedicated 821-line module.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F5.1 | **Failed to escalate** | Kept trying instead of handing to a human | ✅ |
| F5.2 | **Escalated without context** | Human receives a ticket with no history | ✅ |
| F5.3 | **Loops instead of escalating** | Scheduling agent when the caller goes off-script | ✅ |
| F5.4 | **Turn-depth degradation** | Quality collapses after step 4 | ◐ |
| F5.5 | **False resolution** | Marks resolved without resolving | ✅ |
| F5.6 | **Dropped hand-off** | Escalation raised, nobody owns it, no SLA | ✅ |
| F5.7 | **Sentiment/urgency blindness** | Misses a distressed or legally-charged user | ✅ |

**Built:** `src/nometria/escalation.py` — a per-agent escalation policy (conditions that must trigger hand-off: low confidence, repeated failure, user frustration, out-of-scope, regulated topic), counterfactual detection ("this should have escalated"), context-complete hand-off packages, and owner + SLA tracking on the queue (`EscalationPolicy.owner_role`/`sla_minutes`, `Handoff.due_at`, `breached_handoffs()`). The dashboard's hand-off queue reads from this directly.

**F5.4 stays ◐:** what's measured is a turn-depth-correlated abstention-rate proxy, not an actual quality-trend measurement against ground truth — a real signal, but not the same claim as "we detect the conversation getting worse," so it's marked partial rather than done.

### F6 — Commitment, advice & liability

| # | Failure mode | Example | Status |
|---|---|---|---|
| F6.1 | **Binding commitment** | Promises a refund/discount/SLA the company must honour | ◐-unwired |
| F6.2 | **Unlicensed advice** | Financial, medical or legal advice | ◐-unwired |
| F6.3 | **Missing AI disclosure** | EU AI Act Art. 50 | ◐-unwired |
| F6.4 | **Adverse action, no reason** | Denial without explanation (FCRA/ECOA) | ◐-unwired |
| F6.5 | **Discriminatory outcome** | Screening bias | ◐-unwired |
| F6.6 | **Decision not recorded** | No auditable basis for a regulated decision | ✅ |

**Built but not wired — this whole family needs a distinct call-out.** `src/nometria/commitments.py` and `src/nometria/register.py` implement real, individually-tested logic for F6.1-F6.5 (commitment detection, an unlicensed-advice classifier, AI-disclosure checks, adverse-action/ECOA reasoning, and `fairness_probe`/`FairnessResult` for F6.5's disparate-impact-style check). Every one of them passes its own unit tests. **None of them is called from `guardrails/pipeline.py`, `enforcement.py`, or any gateway route** — a real production request today gets zero benefit from any of F6.1-F6.5, despite the modules existing and being correct in isolation. This is worse than a normal ◐ partial (partial coverage on a live path) and better than ✗ (no logic exists) — it needs its own fix, which is "wire five already-written detectors into the pipeline," not "design and build five new controls." F6.6 (audit chain) is unaffected — it was already wired and remains ✅.

### F7 — Numeric, temporal & entity integrity

| # | Failure mode | Example | Status |
|---|---|---|---|
| F7.1 | **Hallucinated record match** | *The reconciliation incident* | ✅ |
| F7.2 | **Arithmetic / aggregation error** | Sum doesn't match the rows cited | ✅ |
| F7.3 | **Wrong period** | Fiscal vs calendar year | ✅ |
| F7.4 | **Unit / currency error** | USD vs EUR, thousands vs millions | ✅ |
| F7.5 | **Entity confusion** | Right answer, wrong customer | ✅ |
| F7.6 | **Timezone error** | Off-by-one day on a deadline | ◐ |
| F7.7 | **Self-contradiction across turns** | Contradicts its own earlier answer | ✗ |

**Built:** `src/nometria/integrity.py`, wired into `enforcement.py:97,1293` — record-match verification against the system of record, arithmetic/aggregation cross-checks, fiscal-vs-calendar period disambiguation, unit/currency normalization, and entity-confusion detection are all live on the enforcement path, not just unit-tested in isolation.

**F7.6 stays ◐:** what's built detects timezone *ambiguity* in the input (is this date unambiguous across zones), not an actual verified date-shift error against a known-correct value — a narrower claim than "catches off-by-one-day deadline errors."

**F7.7 stays ✗, and there's a real doc bug attached to it:** cross-turn self-contradiction detection is genuinely absent — nothing tracks an agent's own prior claims to catch it contradicting itself later. `integrity.py:417`'s own docstring currently claims `self_consistency` covers this; it doesn't — `self_consistency` checks internal consistency *within* one generation, not consistency *across turns*. That docstring should be corrected as part of any future integrity.py change, independent of whether F7.7 gets built.

---

## Coverage summary

| Family | Modes | ✅ | ◐ | ◐-unwired | ✗ | Share of real-world failures |
|---|---|---|---|---|---|---|
| F1 Answerability & abstention | 6 | 6 | 0 | 0 | 0 | high — drives F2/F7 |
| F2 Source authority | 6 | 6 | 0 | 0 | 0 | high |
| F3 Destructive actions | 10 | 9 | 0 | 0 | 1 | **fastest-growing (+62%)** |
| F4 Entitlement & disclosure | 8 | 7 | 1 | 0 | 0 | **highest commercial value** |
| F5 Escalation breakdown | 7 | 6 | 1 | 0 | 0 | **31.1% — largest single class** |
| F6 Commitment & liability | 6 | 1 | 0 | 5 | 0 | high severity, low frequency |
| F7 Numeric & entity integrity | 7 | 5 | 1 | 0 | 1 | high in finance/ops |
| **Total** | **50** | **40** | **3** | **5** | **2** | |

**We cover 40 of 50 outright, as of 2026-08-29** (was 1 of 50 on 2026-08-18). Two modes are genuinely absent — F3.8 (composed privilege escalation across chained tools) and F7.7 (cross-turn self-contradiction) — and are real, scoped gaps worth building next, not oversights. Three are honest partials (F4.7 MNPI/legal-hold class untested by name, F5.4 turn-depth proxy rather than true quality-trend detection, F7.6 timezone ambiguity rather than verified date-shift detection). Five — all of F6 except F6.6 — are the **◐-unwired** pattern: real, individually-tested modules (`commitments.py`, `register.py`) that nothing in the live request path ever calls. That's the highest-leverage remaining fix in this whole document: it's wiring, not invention.

The pillars built earlier (taint containment, audit chain, policy engine, computed control status) turned out to be genuine substrate — F1-F5 and most of F7 were built as detectors, policy conditions, and scorers inside that same architecture, which is why coverage moved this far this fast.

---

## What this implies for the build

Highest-leverage items first:

1. **Wire F6 into the live pipeline.** Five fully-built, fully-tested detectors (`commitments.py`, `register.py`) sit unused because nothing calls them from `enforcement.py`/`guardrails/pipeline.py`/the gateway routes. This is the cheapest remaining item in the entire taxonomy — no new detection logic, just routing existing calls onto the request path, the same fix already identified and applied for `agent_loop.py`/`jobs.py`/`availability.py` elsewhere in the codebase (see [gap-analysis.md](gap-analysis.md)).
2. **F3.8 — composed privilege escalation.** Needs cross-tool data-flow tracking at the orchestration layer (does a read tool's output feed a write tool's authorization boundary), which nothing today attempts. Highest-severity remaining gap in F3 given F3's "fastest-growing failure class" status.
3. **F7.7 — cross-turn self-contradiction.** Needs a claim-history store per conversation and a contradiction check against it; also fix the misleading `self_consistency` docstring at `integrity.py:417` while touching this file.
4. **Firm up the three ◐ partials** (F4.7 named legal-hold class, F5.4 real quality-trend detection, F7.6 verified date-shift vs. ambiguity-only) — each is a bounded extension of an already-built mechanism, not new architecture.

The four-family framing from the original document (F4 entitlement, F3 action semantics, F1 answerability, F2 source authority) is now **built**, not planned — those are the differentiators to defend and demo, not the backlog.

---

## Sources

[Morningstar/PR Newswire — enterprise AI failures shifting beyond hallucinations (ChatSee, 10k+ events)](https://www.prnewswire.com/news-releases/new-research-finds-enterprise-ai-failures-are-shifting-beyond-hallucinations-as-companies-move-from-chatbots-to-agents-302837907.html) · [AI Incidents H1 2026 retrospective](https://www.digitalapplied.com/blog/ai-incidents-h1-2026-retrospective-failure-modes-analysis) · [Enterprise AI agent failure modes](https://thoughtminds.ai/blog/enterprise-ai-agent-failure-modes) · [AI agent production failures — enterprise lessons](https://www.openempower.com/blog/ai-agent-production-failures-enterprise-lessons-2026)

[M365 Copilot oversharing — what IAM and data teams must fix](https://nhimg.org/community/cybersecurity-beyond-identity/microsoft-365-copilot-oversharing-what-iam-and-data-teams-must-fix/) · [Copilot didn't overshare your data, your permissions did](https://petri.com/copilot-didnt-overshare-your-data-your-permissions-did/) · [Microsoft — mitigate oversharing for Copilot and agents](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/mitigate-oversharing-to-govern-microsoft-365-copilot-and-agents/4448744)

[Protect production SQL databases from agentic query risks](https://rietta.com/blog/ai-sql-database-data-protection-read-replica/) · [Production-ready text-to-SQL: 9 problems with fixes](https://atalupadhyay.wordpress.com/2026/07/01/building-a-production-ready-text-to-sql-ai-agent-9-problems-with-fixes/) · [AI agent database wipe — lessons](https://www.mindstudio.ai/blog/ai-agent-database-wipe-disaster-lessons/) · [Testing SQL agents — safety & query validation](https://langwatch.ai/scenario/testing-guides/sql-agent/)

[AbstentionBench — reasoning LLMs fail on unanswerable questions](https://arxiv.org/html/2506.09038v1) · [Know Your Limits — a survey of abstention in LLMs (TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00754/131566/Know-Your-Limits-A-Survey-of-Abstention-in-Large) · [The unexpected downside of RAG — over-refusal](https://www.bohrium.com/en/blog/research-notes/aaai-2026-retrieval-augmented-models-dont-know/)
