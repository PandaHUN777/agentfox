# PM/marketer language audit — round 3

Source: two independent fresh-eyes agents playing a non-technical product manager
(given a scenario: diagnose an agent failure and explain it in plain English to a VP)
and a non-technical marketer (whole-app sweep, page by page). Both had zero prior
context and used only the rendered UI. Full reports are in the session transcript.

Directive from the user: assume the reader is a PM or marketer with no technical
background, who wants to understand where their agents went wrong without being shown
raw IDs — page language, naming, and identifiers should be written for them.

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[-]` deferred to a later pass
(scope note explains why)

---

## Foundational fix — agent identity (unlocks many pages at once)

- [ ] **Agents have a real display name already in the database
  (`Agent.name`, e.g. "Payments Operations Agent") that the UI never shows** — every
  list, URL, and page title uses the raw slug (`payments-ops`) instead. Both audits
  independently flagged this as one of the most damaging issues, and one caught the
  product contradicting itself: the same agent is called "payments-ops" everywhere
  except one escalation transcript, where it's suddenly "Payments Operations Agent."
  Fix: make `name` the primary, bold, headline identifier everywhere an agent is
  shown; keep the slug as small muted secondary text (it's still needed for the URL
  and for engineers cross-referencing logs) instead of hiding the name that already
  exists.

## Raw IDs used as page headlines

- [ ] **Trace detail page's `<h1>` is the raw trace ID** (`t.id`, e.g.
  `trc_a1b2c3d4...`) in monospace — the single biggest, most prominent text on the
  page is an opaque code with zero plain-English summary of what happened.
- [ ] **Escalation's one real conversation is titled and linked as
  `seed-refund-dispute-1`** — both in the hand-off queue table and as the detail
  page's own heading. An internal seed/test ID is the primary, clickable label for
  what is, underneath, a real customer conversation about a refund dispute.
- [ ] **Findings list uses raw finding IDs** in its `key`/detail-link context — check
  whether the finding *title* (already present per-row) is the visible link text or
  whether an ID leaks through anywhere in that flow.

## Jargon presented with no inline explanation (tooltip-only or Glossary-only)

- [ ] **The "Effective policy" table on every Agent detail page** lists ~25 raw rule
  codes (`eu.art10.special_category_data`, `injection.indirect`,
  `taint.high_impact_tool`, `budget.exceeded`, ...) with no plain-English gloss in the
  row itself — flagged as a `[blocker]` by both audits, and it's the exact table a PM
  would open to answer "what's actually stopping this from going wrong."
- [ ] **Compliance's Controls table gives visual priority to codes over the plain
  sentence** — `NOM-AUD-01`, `P5-1`, `P5-6` are styled larger/first, with the one
  actual explanation ("The complete execution path of every invocation is recorded")
  reading as secondary. Both audits called this the single worst page for a
  non-technical reader.
- [ ] **Bare parenthetical codes dropped into ordinary sentences** — `(P7)`, `(P8)`,
  `(P4-3)` on Start Here and Evaluation, with no adjacent gloss.
- [ ] **Stat tiles give a number with no stated direction of "good vs bad"** — e.g.
  "0.0% runs degraded or shed," "41 not computed," "0 lineage edges." A reader
  frequently can't tell if a zero is a problem or a non-event without already knowing
  the domain.
- [ ] **Policies/Guardrails detector tables name real open-source libraries with zero
  business context** (Presidio, spaCy, NeMo/Colang, Granite Guardian, Llama Guard,
  ShieldGemma) and the same table appears on both pages with different stats and no
  cross-link explaining why.
- [ ] **Evaluation's scorer/SLO tables** (`ragas_faithfulness`, `self_consistency`,
  "attainment," "error budget," "drift") are the densest unexplained jargon outside
  Compliance.

## Scope note — what's realistically in/out for this pass

The two reports together span essentially every page in the product; a literal
line-by-line rewrite of all of it in one pass would be both enormous and, done
hastily, would produce worse copy than what exists. Prioritizing by what most
directly serves the user's stated goal — "understand where their agents went wrong
without random IDs" — and doing those well, rather than touching everything
shallowly:

**In scope for this pass:** agent display names everywhere; Trace/Escalation
headline rewrites; Effective-policy-table plain-English glosses; Compliance
Controls table code de-emphasis; the most damaging bare-code-in-sentence instances.

**Deferred, logged for a follow-up pass:** a full glossary-linking pass across every
jargon term on every page; Policies/Guardrails/Evaluation deep content rewrites;
Start Here/Connect/API tokens (these are inherently developer-setup screens — a
marketer "can't get past onboarding" is expected, since onboarding is instrumenting
code; the operational monitoring pages are where "where did my agent go wrong" lives
and are prioritized instead).

---

## Session log

- 2026-08-25 — Two fresh-eyes agents (PM diagnosing a failure, marketer sweeping the
  whole app) dispatched and reports collected. Found the Agent model already has a
  `name` field with good seeded display names that the frontend never renders —
  the highest-leverage fix in this round, since it's a display change, not new data.
  Also re-investigated and fixed a real miss from round 2: "the Copilot failure"
  reference, which I'd wrongly marked as non-reproducing because my earlier grep only
  covered dashboard `.tsx` files and missed that the string is generated server-side
  in `entitlement.py`'s empty-state note.
- 2026-08-25 (continued) — Closed every item: added a shared `AgentLink` component
  and wired it into Agents, Traces, Findings, Escalation, and the Finding detail
  page; rewrote the Trace detail and Escalation conversation headlines to lead with
  a plain-English summary instead of a raw ID (added `agent_name` to the trace API
  and a `summary`/`reason` field to the handoff API to make this possible); found
  and fixed a real backend serialization bug where `ResolvedRule.to_json()` never
  included the `description` field despite the policy YAMLs already having one for
  most rules — then filled in the 7 rules across 3 policy files that genuinely had
  no description at all; restructured the Compliance controls table so the plain
  sentence leads and the code is secondary. Full `pytest` suite (1061 passed) and
  `npm run build` green; every fix reverified live against a fresh reseed after the
  final backend restart.
