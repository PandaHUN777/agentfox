# Business Failure-Mode Analysis — where deployed agents actually break

**Companion to [gap-analysis.md](gap-analysis.md).** That document benchmarked us against vendor feature lists. This one benchmarks us against **how enterprise agents actually fail in production** — which turns out to be a very different, and more useful, target.

**Update — 2026-08-29.** The taxonomy below was written 2026-08-18 against a codebase that
covered **1 of 50** modes. Roughly fifteen commits of build-out since then (`4f8369f`
escalation, `f06dc73` source authority + numeric integrity, `65ee7d4` action assurance,
`e49b88d` entitlement, `58b6a47` answerability, and the reconciliation passes `a3d3fe2` /
`6cc667e`) closed nearly all of it. Current, machine-verified status (`python
scripts/coverage.py`, cross-checked against [`coverage-map.md`](coverage-map.md)'s
independent architecture-level audit):

- **54 of 57 modes covered outright, 2 partial, 1 absent** — F1 (6/6), F2 (6/6), F3
  (10/10), F4 (8/8), F5 (7/7) and F7 (7/7) are now **complete**. F8 (added below, from
  the PRD v3 taxonomy) is 5/7 + 1 partial + **F8.3 stale index, still absent**. F6 has one
  partial (F6.2, lexicon-only advice detection).
- A **second, independent audit** ([`coverage-map.md`](coverage-map.md), built from the
  architecture of a request rather than from this taxonomy, specifically to avoid the
  circularity of only checking what we set out to check) found **5 failure modes this
  taxonomy never listed at all**, all still absent. They are the real remaining gap and
  get their own section below, with concrete detection designs rather than the "what's
  needed" prose the rest of this document originally shipped with.

The rest of this document is left largely as originally written — the incident data and
the reasoning for *why* these families matter are unchanged — but every status marker
and the coverage summary have been corrected to current reality, and two new sections
cover F8 and the five newly discovered gaps.

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

## The taxonomy — 8 failure families, 57 modes

Legend: ✅ covered · ◐ partial · ✗ absent (all verified against the codebase via
`python scripts/coverage.py`, cross-checked against [`coverage-map.md`](coverage-map.md)).

### F1 — Answerability & abstention
*"If someone asks for future sales, the answer should be 'data not available', not a generated one."*

The research is unambiguous that this is unsolved: **AbstentionBench** (20 datasets, 35k+ unanswerable queries) finds that **reasoning fine-tuning often *degrades* abstention** — newer, more capable models are *worse* at saying "I don't know". And the inverse failure is real too: retrieval noise causes **over-refusal**, where the model refuses questions it could answer.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F1.1 | **Answers an unknowable question** | "What will Q4 2027 revenue be?" → generates a number | ✅ `classify_answerability` |
| F1.2 | **Answers outside the data coverage window** | Index holds 24 months; asked about 5 years ago | ✅ `_temporal_scope` |
| F1.3 | **Answers for an entity not in scope** | Customer not in the CRM → invents a record | ✅ `_entity_scope` |
| F1.4 | **Prediction presented as record** | Forecast stated in the same register as an actual | ✅ `PREDICTION_MARKERS` |
| F1.5 | **Over-refusal** | Refuses something it can and should answer; kills adoption | ✅ `detect_over_refusal` |
| F1.6 | **Partial answer presented as complete** | Retrieved 3 of 50 relevant docs, answers as if exhaustive | ✅ `completeness_signal` |

**Built.** Pillar 7 shipped: a declared **knowledge boundary** per agent (systems of record,
time range, entity scopes, answerable question types), a pre-flight **answerability
classifier** that routes unanswerable questions to templated abstention before generation,
and a post-flight boundary check. 52 tests. Still directly sellable — *"your agent will say
'I don't have that' instead of inventing it"* — and still a control nobody in the
competitive set ships; the work now is proving it in a sales cycle, not building it.

### F2 — Source authority & provenance
*"How do we know it didn't use an unverified source?"*

Our `groundedness` scorer checks the **answer against the retrieved context**. It never asks whether that **context was authoritative**. An agent that faithfully grounds an answer in a deprecated 2019 wiki page scores 1.0.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F2.1 | **Unauthoritative source** | Answers a pricing question from a personal OneNote, not the price book | ✅ `source_tier` |
| F2.2 | **Stale source** | Policy changed last week; index is a month old | ✅ `freshness_breach` |
| F2.3 | **Fabricated citation** | Cites a document that does not contain the claim | ✅ `detect_fabricated_citations` |
| F2.4 | **Contradictory sources, silent pick** | Two docs disagree; agent picks one, never says so | ✅ `detect_source_conflict` |
| F2.5 | **Uncited assertion** | Material claim with no source at all | ✅ `GroundednessScorer` |
| F2.6 | **Source outside the agent's declared domain** | Support agent answering from the finance corpus | ✅ `domain_breach` |

**Built.** Every retrieved chunk carries **source tier** (system-of-record / approved /
unverified / external), **freshness**, and **owner**; policy is expressed exactly as
originally specified — *"financial figures may only be sourced from tier-1 systems of
record less than 24h old; anything else must be caveated or blocked"* — and **citation
binding** maps each material claim to a chunk and verifies the chunk supports it. 40
tests, 6/6. Remaining gap is upstream of this family: `P8-9`, ingesting third-party
catalog/lineage metadata (DataHub, OpenMetadata, Unity Catalog) so source tier and
ownership can be *derived* rather than hand-declared per agent.

### F3 — Destructive & irreversible actions
*"How do we know the prompt can cause destructive changes to the DB?"*

Our containment is **argument-level** on **declared tools** (`amount < 1000`). It has nothing to say about a **generated artefact** — SQL, a script, an API body — whose destructiveness lives in its *structure*, not its arguments.

The research is specific about how to do this correctly: **deterministic parsing, not an LLM checking the SQL**, with **zero false negatives**, and **comments stripped first** — because `SELECT * FROM users -- ; DROP TABLE users` defeats naive keyword matching.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F3.1 | **Destructive DML** | `DELETE FROM orders` with no `WHERE` | ✅ `sql.unbounded_mutation` |
| F3.2 | **DDL / schema change** | `DROP TABLE`, `TRUNCATE`, `ALTER` | ✅ `sql.destructive_ddl` |
| F3.3 | **Unbounded blast radius** | `UPDATE` matching 1.2M rows | ✅ `_is_tautology` + row-estimate |
| F3.4 | **Wrong environment** | Ran against prod, not staging — *the 1.9M-row incident* | ✅ `environment_risk` (P9-6) |
| F3.5 | **Comment/stacked-statement evasion** | `-- ; DROP TABLE` | ✅ `sql.stacked_statements` |
| F3.6 | **Irreversible act on unverified state** | Welcome email on a hallucinated acceptance | ✅ `_verified_state_gate` (P9-7) |
| F3.7 | **Duplicate execution on retry** | Same refund issued twice | ✅ `idempotency_key` — effect ledger |
| F3.8 | **Composed privilege escalation** | Read tool + write tool chained into something neither permits | ✅ `sql.privilege_change` (P9-9) |
| F3.9 | **Cascading side effects** | One write fires webhooks/automations | ✅ `cascade_risk` — see caveat |
| F3.10 | **Partial completion, no rollback** | Multi-step action half-applied | ✅ `compensation_plan` |

**Built.** The **action-semantics analyser** — deterministic AST parse of generated SQL,
classified into operation, targets, estimated affected rows, reversibility, and
environment, with comments stripped before matching so `-- ; DROP TABLE` doesn't defeat
it — plus environment binding on the tool target, idempotency keys on irreversible tools,
and a **state-verification precondition** (an irreversible action's premise is read back
from the system of record, not taken from the model's assertion). 10/10, 38 tests. This
was the fastest-growing failure class (+62%) and the one that makes the news (*the
1.9M-row incident*) — now the most completely covered family in the taxonomy.

**Two honest caveats, not gaps in the table above:** F3.9 cascade analysis is only as
good as the trigger declarations it is given — an undeclared webhook stays invisible,
same limitation as F2's source-tier declarations. And shell-command destructiveness
(a sibling of F3.1–3.5 for `rm`/`kubectl`/etc., not one of the 10 catalogued SQL modes)
is still a deny-list, not a parser — the SQL-grade AST treatment hasn't been extended to
shell yet.

### F4 — Entitlement & disclosure
*"The agent has an SDK for information that must not be given."*

The Copilot research puts it exactly right: **"a governance failure rather than a security breach — every permission check passed."** The agent runs with its own service identity and inherits the union of everything it can reach. Nothing checks what **this requesting human** is entitled to.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F4.1 | **Oversharing via retrieval** | Employee asks about salaries; index has HR docs; every ACL passes | ✅ `filter_retrieval` |
| F4.2 | **Agent identity ≠ user entitlement** | Agent's service account is broader than the caller | ✅ `EndUserPrincipal` |
| F4.3 | **Cross-tenant leakage** | Multi-tenant app, tenant A sees tenant B | ✅ `TenantScoped` + session isolation |
| F4.4 | **Aggregation disclosure** | Salary band + headcount of 1 → an individual's salary | ✅ `aggregation_risk` — k-anonymity |
| F4.5 | **Inference disclosure** | Model infers a protected attribute never stored | ✅ `inference_risk` |
| F4.6 | **Purpose limitation breach** | Support data reused for marketing (GDPR Art. 5) | ✅ `purpose_limitation` |
| F4.7 | **MNPI / blackout / legal hold** | Agent surfaces material non-public information | ✅ `RESTRICTED_CLASSES` |
| F4.8 | **Residency violation** | EU subject data answered from a US context | ✅ `filter_retrieval` + residency (P10-8) |

**Built — 8/8, 16 tests.** The **end-user principal** propagates through the agent to
retrieval and tools; responses are filtered to what that principal is entitled to see;
k-anonymity-style aggregation checks and inference-disclosure detection ship. This was
called out as the single highest-value gap commercially — *the reason Copilot rollouts
stall* — and is now fully covered against the catalogued modes. The one declared seam:
`P10`'s OpenFGA adapter is a stub, not a live integration — fine-grained authorization
still runs on the built-in model, not a customer's existing OpenFGA/Zanzibar deployment.

### F5 — Escalation & resolution breakdown — **31.1% of all failures**

The largest category. It went from **zero** coverage to **fully built** — control
`NOM-RTG-10` — in the same build-out that closed F1–F4.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F5.1 | **Failed to escalate** | Kept trying instead of handing to a human | ✅ `detect_missed_escalation` |
| F5.2 | **Escalated without context** | Human receives a ticket with no history | ✅ `handoff_completeness` |
| F5.3 | **Loops instead of escalating** | Scheduling agent when the caller goes off-script | ✅ `_loop_without_handoff` |
| F5.4 | **Turn-depth degradation** | Quality collapses after step 4 | ✅ `turn_depth_risk` — see caveat |
| F5.5 | **False resolution** | Marks resolved without resolving | ✅ `detect_false_resolution` |
| F5.6 | **Dropped hand-off** | Escalation raised, nobody owns it, no SLA | ✅ `breached_handoffs` |
| F5.7 | **Sentiment/urgency blindness** | Misses a distressed or legally-charged user | ✅ `sentiment_signal` |

**Built — 7/7, 17 tests.** An **escalation policy** per agent (`must_escalate_when`:
confidence, repeated failure, sentiment, regulated topic, repeated abstention, turn
depth, explicit request); detection of the **counterfactual** — it met a condition and
did not hand off, which is the specific claim nobody else in the competitive set makes;
context-complete hand-off packages; ownership and SLA with breach findings. Headline
metric `missed_rate` is measured against *qualifying* conversations, not all traffic,
deliberately, so it can't be flattered by denominator inflation.

**One caveat inside F5.4:** turn *depth* is measured and escalated on (the mechanism the
original catalogue asked for). Quality *per depth* — whether answers are getting worse,
not just longer — is not separately scored. That distinction is worth carrying forward
rather than treating F5.4 as fully closed.

### F6 — Commitment, advice & liability

| # | Failure mode | Example | Status |
|---|---|---|---|
| F6.1 | **Binding commitment** | Promises a refund/discount/SLA the company must honour | ✅ `detect_commitments` |
| F6.2 | **Unlicensed advice** | Financial, medical or legal advice | ◐ `SafetyLexiconDetector` — lexicon only, no licensed-advice classifier |
| F6.3 | **Missing AI disclosure** | EU AI Act Art. 50 | ✅ `disclosure_required` |
| F6.4 | **Adverse action, no reason** | Denial without explanation (FCRA/ECOA) | ✅ `adverse_action_risk` |
| F6.5 | **Discriminatory outcome** | Screening bias | ✅ `fairness_probe` — four-fifths rule |
| F6.6 | **Decision not recorded** | No auditable basis for a regulated decision | ✅ `Decision` |

**5/6, one real partial.** F6.2 is the one mode in this family still lexicon-only: it
catches keyword-level financial/medical/legal language but has no classifier that
distinguishes *licensed advice* from *general information delivered by someone qualified
to give it*. That distinction needs a register/standing check, not more keywords — see
F1's answerability-register work, which is the closer analogue than a bigger lexicon.

### F7 — Numeric, temporal & entity integrity

| # | Failure mode | Example | Status |
|---|---|---|---|
| F7.1 | **Hallucinated record match** | *The reconciliation incident* | ✅ `detect_unmatched_records` |
| F7.2 | **Arithmetic / aggregation error** | Sum doesn't match the rows cited | ✅ `check_arithmetic` |
| F7.3 | **Wrong period** | Fiscal vs calendar year | ✅ `detect_period_mismatch` |
| F7.4 | **Unit / currency error** | USD vs EUR, thousands vs millions | ✅ `detect_unit_mismatch` |
| F7.5 | **Entity confusion** | Right answer, wrong customer | ✅ `detect_entity_confusion` |
| F7.6 | **Timezone error** | Off-by-one day on a deadline | ✅ `detect_timezone_ambiguity` |
| F7.7 | **Self-contradiction across turns** | Contradicts its own earlier answer | ✅ `SelfConsistencyScorer` |

**Built — 7/7.** *The reconciliation incident* — hallucinating a matching record — is
directly covered by `detect_unmatched_records`, and every numeric/temporal/entity mode
in the original catalogue closed alongside it.

### F8 — Context & retrieval integrity *(added from PRD v3 — not in the original 50)*

A recurring pattern across F1, F2 and F7 is that the agent has no access to enterprise
semantics: which table is authoritative, what the index's coverage window actually is,
whether a chunk is coherent. F8 is where that gets enforced structurally, at ingestion
and assembly, rather than re-derived per answer.

| # | Failure mode | Example | Status |
|---|---|---|---|
| F8.1 | **Incoherent chunks** | A chunk boundary splits a sentence or a table mid-row | ✅ `chunk_quality` |
| F8.2 | **Tokeniser / script boundary failures** | `[UNK]` tokens silently corrupt non-Latin text | ◐ `_UNKNOWN_TOKEN` — detected where damage leaves a trace (U+FFFD, `[UNK]`, mojibake); a tokeniser that mis-segments Thai or Khmer *without* emitting one of those markers is not caught |
| F8.3 | **Stale index** | The source document changed; the index that answers from it did not | ✗ **absent** — `def index_freshness` does not exist. F2.2/`freshness_breach` checks whether a *source* is stale relative to a policy SLA; nothing checks whether the *index* has fallen behind the source it was built from |
| F8.4 | **Context-window truncation drops evidence** | The cited evidence doesn't fit the budget and silently disappears | ✅ `assemble_context` — required evidence is seated before ranking; also handles "lost in the middle" via salience reordering |
| F8.5 | **Memory contamination across sessions** | Session B reads a memory written for session A | ✅ `memory_binding_breach` |
| F8.6 | **Retrieval quality drift** | nDCG degrades over time and nobody notices | ✅ `retrieval_drift` — measured against a recorded baseline |
| F8.7 | **Ingestion corruption** | A corrupt or mojibake'd document is ingested and answered from | ✅ `document_quality` |

**5/7 built, 1 partial, 1 absent.** F8.3 is the **only mode in the entire 57-item
taxonomy that is fully unaddressed** — every other family closed. It is a narrow,
well-scoped gap: an `index_freshness` check that compares the index's last-build
timestamp (or per-chunk ingestion timestamp) against the source system's last-modified
timestamp, and raises the same `freshness_breach` class F2.2 already uses, just measured
at the index layer instead of the per-answer layer. This is close enough to shipped
infrastructure that it should be the very next thing built in this family.

---

## Coverage summary

| Family | Modes | ✅ | ◐ | ✗ | Share of real-world failures |
|---|---|---|---|---|---|
| F1 Answerability & abstention | 6 | 6 | 0 | 0 | high — drives F2/F7 |
| F2 Source authority | 6 | 6 | 0 | 0 | high |
| F3 Destructive actions | 10 | 10 | 0 | 0 | **fastest-growing (+62%)** |
| F4 Entitlement & disclosure | 8 | 8 | 0 | 0 | **highest commercial value** |
| F5 Escalation breakdown | 7 | 7 | 0 | 0 | **31.1% — largest single class** |
| F6 Commitment & liability | 6 | 5 | 1 | 0 | high severity, low frequency |
| F7 Numeric & entity integrity | 7 | 7 | 0 | 0 | high in finance/ops |
| F8 Context & retrieval integrity | 7 | 5 | 1 | 1 | feeds F1/F2/F7 |
| **Total** | **57** | **54** | **2** | **1** | |

**We cover 54 of 57 outright, 96% weighted** (`python scripts/coverage.py`, cross-checked
against [`coverage-map.md`](coverage-map.md)). The two partials are F6.2 (unlicensed
advice, lexicon-only) and F8.2 (tokeniser/script damage, detected only where it leaves a
trace). The one absent mode is F8.3 (stale index). This is a complete reversal from the
2026-08-18 snapshot below this line, and it means the commercial argument changes: this
taxonomy is no longer the roadmap, it is close to a finished scorecard. **The real
open list is the section immediately below** — five modes an *independent* audit found
that this taxonomy never included.

---

## The gaps this taxonomy missed — found by an independent audit

[`coverage-map.md`](coverage-map.md) is deliberately built from the architecture of a
request (what can go wrong at each layer a message actually passes through) rather than
from this document, specifically so scoring ourselves against it isn't circular — a
taxonomy can only ever confirm it covers what it set out to cover. That audit is
**execution-verified against the real product** (100 of 114 scenarios run against live
code, not read off a spec) and surfaced five failure modes with **zero coverage** that
never appeared in F1–F8 at all. These are the actual "tasks not yet picked" — not the
now-closed items above — and each gets a concrete detection design below rather than the
one-line "what's needed" the rest of this document used to carry.

### F9.1 — Invalid logical inference *(was L0.4)*

*"All A are B, X is B, therefore X is A."* Undistributed middle, affirming the
consequent, illicit conversion — an agent reasons its way to a wrong conclusion from
premises that were individually true.

**Why an LLM judge doesn't fix this.** Grading reasoning validity with another LLM call
inherits the same fallacy the judge is supposed to catch — it's the same failure mode
one level up, not an independent check. F7's checkers (arithmetic, aggregation) work
*because* they are deterministic and narrow, not because they're smart. The same
strategy applies here, at a smaller scope than "judge the argument":

1. **Extract, don't judge.** Reuse the claim-extraction pipeline already built for F2
   citation binding and F6.1 commitment detection to pull out claims in a formalizable
   shape: categorical (`All X are Y`, `Some X are Y`, `No X are Y`, `X is Y`) or simple
   conditional (`If X then Y`). Extraction is a narrower, more constrained task than
   validity judgment, and is far less prone to inheriting the reasoning bug — it is
   closer to parsing than to reasoning.
2. **Check validity deterministically.** Convert extracted premises/conclusion into
   set-membership predicates and pattern-match against the small, closed list of known
   invalid syllogism shapes (undistributed middle, illicit major/minor term, affirming
   the consequent, denying the antecedent). This is a lookup against ~15 canonical
   invalid forms, not general theorem proving.
3. **Scope tightly, same as F7.** Only fire when premises are explicit and in
   categorical/conditional form. Informal, hedge-laden argument stays out of scope —
   report nothing rather than guess, exactly as F7.2's arithmetic check only fires on
   an explicit stated total.
4. **Interface:** new scorer alongside `check_arithmetic` in the F7 family
   (`check_logical_validity`), sharing the extraction step already paid for by F2/F6.

### F9.2 — Sycophancy: agrees with a false premise *(was L0.7)*

The user asserts something false ("As you know, the deadline is Friday" — it's Tuesday);
the model builds its answer on the user's version rather than correcting it. Reasoning
fine-tuning is documented to make this *worse*, not better (AbstentionBench), so this
isn't a problem model upgrades will quietly fix.

**Detection design**, reusing infrastructure that already exists rather than building a
persuasion detector:

1. **Extract the user-asserted factual claim** from the turn — same extractor as F9.1 and
   F2's citation binding, run against the user message instead of the model's response.
2. **Check it against grounded sources** using the P8 source-tier machinery already
   built for F2: does a tier-1 source contradict the user's stated value?
3. **Classify the model's handling**, deterministically: does the response contain a
   correction/caveat token set (*"actually"*, *"to clarify"*, *"that's not quite
   right"*, *"I show a different date"*) **and** restate the source-grounded value? If
   the contradiction exists and neither is present, flag
   `SYCOPHANCY.PREMISE_UNCORRECTED`.
4. **Precondition, to avoid false positives:** only fires when there is a checkable
   grounded source — same boundary P8/F2 already enforce. Opinions, preferences and
   genuinely ungrounded matters never trigger it.

### F9.3 — Answer quality degrades in non-English *(was L0.10)*

Correct in English, subtly wrong in German — and nothing currently measures this at all;
detectors are multilingual for *injection* (L1.4, 4/4 languages caught) but nothing
checks whether **answer quality** holds up per language.

**Detection design — reframe as a parity problem, not a quality-grading problem:**

1. Don't build a new "is this answer good in Polish" grader — that's exactly the kind of
   subjective LLM-judged check this codebase avoids elsewhere. Instead, extend the
   **existing deterministic F7 checkers** (arithmetic, date/period, currency/unit,
   entity match) to parse non-English number and date formats (`1.234,56` vs
   `1,234.56`; `DD.MM.YYYY` vs `MM/DD/YYYY`; non-Latin numerals) so the same checks that
   already run in English run correctly in the target languages.
2. Run the existing eval/red-team suite (P4) in parallel across English and N target
   languages on matched prompts, and add a **cross-lingual parity scorer**: report
   divergence in pass rate between English and each other language as a drift signal,
   the same way P4 already reports drift over time (PSI/KS).
3. This turns "is quality worse in German" (hard, subjective) into "do the same
   deterministic checks fire more often in German because a parser is English-only"
   (tractable, and directly actionable — each divergence points at a specific parser to
   fix).

### F9.4 — Gradual multi-turn manipulation (crescendo) *(was L1.6, tagged `known-gap`)*

Each individual turn is innocuous; the trajectory across turns is not. Every injection
detector in P3 scores one message at a time, so a crescendo attack never crosses a
per-message threshold.

**Detection design — reuse trajectory scoring already built for a different purpose:**

P13 already measures **goal drift**: trajectory against a recorded task intent, used for
F5/handoff fidelity ("retained 0.00 of the brief, losing \['limit', 'prohibition'\]").
Crescendo detection is the same primitive pointed at a different baseline:

1. At each turn, in addition to the existing per-message P3 detector run, record a
   **risk-adjacent score**: sub-threshold detector activations (findings that scored
   below the block threshold but above zero), embedding-distance drift from turn 1's
   topic to the current turn, and reframing markers (*"just hypothetically"*, *"for a
   story"*, *"as a thought experiment"*) that are known crescendo scaffolding.
2. Maintain this as a rolling window (last 5–8 turns) rather than a cumulative score, so
   a conversation that drifts and then genuinely resolves isn't penalized forever.
3. Fire `CRESCENDO.TRAJECTORY_DRIFT` when the **slope** of the risk-adjacent score over
   the window crosses a threshold, independent of whether any single turn crossed the
   per-message block threshold.
4. **Interface:** extends P13's trajectory measurement (already built, already tested)
   with a safety baseline alongside its existing task-intent baseline — not new
   architecture, a new comparison target on existing infrastructure.

### F9.5 — Context stuffing to push out the system prompt *(was L1.9)*

Megabytes of filler before the real instruction, diluting or displacing the system
prompt's authority. P14-6 (context-budget governance) is specified but only half-built:
F8.4 already guarantees *cited evidence* survives truncation and reordering. Nothing
guarantees the *system prompt itself* survives dilution.

**Detection design — extend the assembly-stage check F8.4 already performs:**

1. F8.4's `assemble_context` already tags tokens by provenance via the taint machinery
   built for P3-4 (system-authored vs. user-supplied vs. retrieved). Reuse that tagging
   rather than building new classification.
2. Add a second guarantee alongside "cited evidence is seated before ranking": compute
   the ratio of system/policy/tool-schema tokens to total assembled context, and flag
   `CONTEXT.AUTHORITY_DILUTED` when that ratio drops below a floor (e.g. system-prompt
   share under 2% of the assembled window).
3. Separately, flag `CONTEXT.SINGLE_TURN_STUFFING` when one low-provenance turn (a user
   message or a single retrieved document) contributes more than a fixed token threshold
   in one shot — the mechanism a crescendo-adjacent stuffing attack actually uses.
4. **Interface:** this is not a new pillar. It's the missing half of P14-6, sitting in
   the same `assemble_context` function F8.4 already covers — the natural next commit
   for that file, not a new capability area.

---

## What this implies for the build

The four capability areas below were the priority list at 2026-08-18, when this document
covered 1 of 50 modes. All four are now built (F1, F2, F3, F4 above — each 6/6 to 10/10).
**The priority list going forward is narrower and different in kind:**

1. **F8.3 — stale index.** The one fully-absent mode inside the original taxonomy. An
   `index_freshness` check, same shape as F2.2's `freshness_breach`, measured at the
   index layer. Small, well-scoped, and the natural next commit in the P8/P14 family.
2. **F9.1–F9.5 above** — the five modes an independent, execution-verified audit found
   that no version of this taxonomy ever listed. All map onto existing interfaces
   (`Detector`, `Scorer`, the P13 trajectory primitive, the P3-4 taint tagging, the F2/F7
   extraction and checker machinery) rather than requiring new architecture — but they
   are net-new coverage, not refinements of something already built.
3. **The two remaining partials** — F6.2 (a licensed-advice register check, not more
   lexicon) and F8.2 (script-boundary detection without relying on damage markers like
   `[UNK]`/mojibake, which a well-behaved-but-wrong tokeniser won't emit).
4. **The declared seams surfaced while closing F1–F5** — `P8-9` catalog ingestion
   (DataHub/OpenMetadata/Unity), `P10`'s OpenFGA adapter, and F3's shell-command
   deny-list versus the AST-grade treatment SQL already has. None of these are new
   findings; they're the honest edges of work that's otherwise done.

The strategic point carries over unchanged from the original version of this document:
**every item above is expressible as a detector, a policy condition, or a scorer in the
architecture that already exists.** What changed is that the architecture is no longer
hypothetical — it has 54 of 57 original modes running against it, and the five new modes
above are additions to a working system, not a first build.

---

## Sources

[Morningstar/PR Newswire — enterprise AI failures shifting beyond hallucinations (ChatSee, 10k+ events)](https://www.prnewswire.com/news-releases/new-research-finds-enterprise-ai-failures-are-shifting-beyond-hallucinations-as-companies-move-from-chatbots-to-agents-302837907.html) · [AI Incidents H1 2026 retrospective](https://www.digitalapplied.com/blog/ai-incidents-h1-2026-retrospective-failure-modes-analysis) · [Enterprise AI agent failure modes](https://thoughtminds.ai/blog/enterprise-ai-agent-failure-modes) · [AI agent production failures — enterprise lessons](https://www.openempower.com/blog/ai-agent-production-failures-enterprise-lessons-2026)

[M365 Copilot oversharing — what IAM and data teams must fix](https://nhimg.org/community/cybersecurity-beyond-identity/microsoft-365-copilot-oversharing-what-iam-and-data-teams-must-fix/) · [Copilot didn't overshare your data, your permissions did](https://petri.com/copilot-didnt-overshare-your-data-your-permissions-did/) · [Microsoft — mitigate oversharing for Copilot and agents](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/mitigate-oversharing-to-govern-microsoft-365-copilot-and-agents/4448744)

[Protect production SQL databases from agentic query risks](https://rietta.com/blog/ai-sql-database-data-protection-read-replica/) · [Production-ready text-to-SQL: 9 problems with fixes](https://atalupadhyay.wordpress.com/2026/07/01/building-a-production-ready-text-to-sql-ai-agent-9-problems-with-fixes/) · [AI agent database wipe — lessons](https://www.mindstudio.ai/blog/ai-agent-database-wipe-disaster-lessons/) · [Testing SQL agents — safety & query validation](https://langwatch.ai/scenario/testing-guides/sql-agent/)

[AbstentionBench — reasoning LLMs fail on unanswerable questions](https://arxiv.org/html/2506.09038v1) · [Know Your Limits — a survey of abstention in LLMs (TACL)](https://direct.mit.edu/tacl/article/doi/10.1162/tacl_a_00754/131566/Know-Your-Limits-A-Survey-of-Abstention-in-Large) · [The unexpected downside of RAG — over-refusal](https://www.bohrium.com/en/blog/research-notes/aaai-2026-retrieval-augmented-models-dont-know/)
