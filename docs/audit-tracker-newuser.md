# New-user navigability audit — 2026-08-25, round 2

Source: four independent "fresh eyes" agents, each given zero prior context about the
product and a distinct first-time-user persona, set loose on a live seeded instance
(local dev server + fresh SQLite DB, `nometria seed`). None read source code or docs —
only the rendered UI, exactly like a real visitor. Personas: (1) cold visitor with no
explanation, (2) an incident investigator following up a customer complaint, (3) a
day-one solo operator onboarding their own agent, (4) a non-technical compliance
stakeholder assembling audit evidence. Full reports are in the session transcript.

This file tracks what came out of those four reports plus my own code-level
verification of each claim (agents' browser tooling was itself flaky this run — several
claims turned out to be tooling artifacts, not real bugs, and are marked discarded
below with the reason — always after actually trying to reproduce them, not on
suspicion alone).

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[-]` intentionally deferred ·
`[discarded]` investigated, not a real issue

---

## Tier 1 — real contradictions and bugs (not just copy) — all closed

- [x] **Compliance/Board "orphaned 41."** `posture()` in `status.py` only counted
  controls that already had a computed `ControlStatus` row, so a freshly-synced
  41-control catalog with zero computed statuses reported `controls: 0` and every
  status bucket at 0 — with no visible account of where the other 41 went. This also
  caused Board's "control effectiveness by framework" table to show 0 controls per
  framework while the Frameworks tab (which counts raw `FrameworkMapping` rows
  instead) showed 41/41 — same concept, two numbers, on two pages a careful reader
  would cross-check. Fix: `posture()` now iterates every catalog control key,
  defaulting an uncomputed control to `not_computed` instead of dropping it. Added a
  "not computed" tile + legend entry on Compliance, and a "not computed" column on
  Board's framework table. Verified live: both pages now correctly show 41 across the
  board when nothing's been assessed.

- [x] **Start Here claims nothing is enforced yet; Policies shows `tool-containment`
  already in `enforce` mode.** Verified in `policies_data/tool-containment.yaml`: this
  is deliberate — an intent-based, structural containment policy the design
  explicitly wants on from install ("assume the model can be convinced of anything,
  constrain what a convinced model is permitted to do... these rules hold even when
  the injection detector missed the payload entirely"), distinct from `baseline`'s
  deliberate observe-by-default (content-based, higher false-positive risk). But
  Start Here's copy made a blanket claim that's false given this design ("nothing is
  refused until you run the last step"). Fix: corrected the copy (frontend intro,
  note-panel, and the backend step-7 detail text in `onboarding.py`) to distinguish
  structural containment (on by default, by design) from content policies (off by
  default, step 7 turns them on) — not reversed the enforcement default, which is a
  deliberate security posture already justified in the policy file itself. Updated
  `test_enforcement_is_the_last_step`, which had encoded the inaccurate claim as an
  assertion.

- [x] **Agent detail page contradicts Escalation for the same agent.** `payments-ops`
  has a real, seeded hand-off with a full 3-turn transcript, but `agent_posture()`
  computed "traces / decisions / blocked / escalated" purely from `Trace`/`Decision`
  rows, and the seeded hand-off was written directly with `trace_id=None`, so none of
  those rows exist for it — the Agent detail page said "No traffic recorded" for an
  agent that provably has activity. Fix: added a `handoffs` count to
  `agent_posture()`, a new "hand-offs" stat card linking to the filtered Escalation
  view, and rewrote the empty-state copy to surface the hand-off count instead of
  flatly claiming no traffic. Verified live: the agent page now shows "1 hand-offs"
  alongside "0 execution paths" with an explanatory note, not a contradiction.

- [x] **Evidence package `audit_entries: 0` vs. live chain-verify showing 1 entry on
  the same page.** Root cause found: **not a bug.** The one audit entry that existed
  was `evidence.exported` — logged as a side effect of the export itself, written
  *after* the package's own contents were already computed. A package can never
  include a record of its own creation; that's correct, not a discrepancy. Fixed the
  confusion instead of the (non-existent) bug: added a note on the Evidence & Reports
  tab explaining the ordering, and an "empty — nothing to show an auditor yet" warning
  badge on any package row whose substantive counts (traces/decisions/control
  statuses/eval runs/findings) are all zero, so an empty package is never silently
  handed to someone as if it were real evidence.

- [x] **`support-triage` auto-classified into the "medical" Annex III domain.** Root
  cause found in `compliance/risk.py`: the `medical` domain-cue list included the bare
  word `"triage"`, which substring-matches `support-triage`'s own slug and any
  customer-service/IT-ticket agent whose purpose says "triages tickets" — nothing
  medical about it. Fix: scoped the cue to phrases that only occur in a clinical
  context (`clinical triage`, `patient triage`, `triage nurse`) instead of the bare
  word. Verified live: `support-triage` now correctly proposes "limited" with no
  Annex III signal, down from the false "high"/"medical" classification.

- [x] **Findings page severity chips vs. legend disagree.** Filter chips offered only
  critical/high/medium while the legend documented a 4th, "low," with no chip for it.
  Confirmed `"low"` is a real severity value used elsewhere (SIEM export, guardrails
  default) — not a dead value. Fix: added it as a 4th filter chip; the backend route
  already accepted any severity string with no enum restriction, so no backend change
  needed.

- [x] **Evaluation page's DRIFT column renders "check drift" with no visible link
  affordance.** Confirmed it *is* a working `<Link>` — the issue is `a { color:
  inherit; text-decoration: none; }`, a global reset that makes every inline link
  look like plain text until hovered, everywhere in the app. Scoped fix for this cell
  (a systemic link-affordance redesign is out of scope for this pass): applied the
  "→" arrow-suffix convention this codebase already uses elsewhere for actionable
  inline links ("Connect →", "Manage knowledge boundaries →").

## Tier 2 — comprehension and disclosure — all closed

- [x] **Glossary decodes codes, not concepts.** Added a "Concepts" section defining
  the plain-English jargon that actually stops a newcomer: Detectors/Guardrails,
  Policies, Controls, Scorers, Findings, Entitlement, Escalation (vs. Approvals),
  Provenance, Knowledge boundary, Groundedness, Blast radius, Policy hierarchy — and
  explicitly reconciled the detectors/controls/scorers/policies terminology sprawl in
  one place instead of leaving four synonyms to be inferred across four pages.

- [x] **Glossary is hard to find when it's needed.** Moved it above the theme
  switcher in the sidebar (was the literal last thing in the nav) and gave it a more
  descriptive label ("Glossary — what the jargon means"). Added an inline link from
  Start Here's intro. Compliance and Policies already linked it in their own intro
  copy — confirmed live, no change needed there. Also found and fixed, while in this
  code, a real self-promotional line that *did* render on the Compliance page
  ("that is a claim only an inline, agent-native platform can make") — my first pass
  at this audit had wrongly assumed this text was unrendered based on a too-narrow
  grep; it was real, present in the actual page copy, and has been removed.

- [x] **Seed/demo data is indistinguishable from real data.** Added an `is_seed`
  column to `agents` and `source_records` (migration `e2f3a4b5c6d7`), set it in
  `seed.py` for the agents/sources it creates, exposed it in the relevant API
  responses, and added a "sample data" badge on Agents (list + detail), Sources, and
  Escalation's hand-off queue (detected there via the existing `seed-` session-id
  prefix, no schema change needed). Board now shows "N of M agent(s) below are sample
  data from `nometria seed`" in its header when applicable. Verified live on a fresh
  reseed: all badges render correctly.

- [x] **Detector install gaps never disclosed during onboarding.** Added a one-line
  disclosure note to Start Here naming which detectors need extra install steps
  (Presidio, Granite Guardian, NeMo Guardrails, Guardrails AI) and linking to the
  Guardrails page to check what's actually active.

- [x] **CORRECTED (was wrongly marked "does not reproduce") — "the Copilot failure"
  cited with zero explanation.** My original grep only checked the dashboard's
  `.tsx` files and missed that this string is generated server-side and fetched into
  the page — it lives in `src/nometria/entitlement.py`'s empty-state `note` field
  (`/api/entitlement/over-permission`), not in any frontend file. A second,
  independent fresh-eyes agent in a later round quoted the exact same phrase, which
  is what prompted re-investigation. Fixed: reworded the note to explain the failure
  mode in one self-contained sentence instead of a bare unexplained reference.

- [x] **No feedback on whether "Assign owner" actually saved — does not reproduce.**
  Directly drove the real form in a live browser session (bypassing the same tooling
  flakiness that affected the original report): filled the field, submitted, and
  confirmed on reload that the value persisted correctly. The plain-form-POST pattern
  used throughout this app gives implicit feedback via the updated value after
  redirect — no separate toast, by established convention, and it works.

- [x] **Kill switch tooltip "truncated" — does not reproduce as a bug, tightened
  anyway.** `InfoTip` uses the native browser `title=` attribute, which cannot be
  CSS-truncated — the full text was always there; the report was very likely the same
  viewport/screenshot flakiness other agents hit. Real improvement made regardless:
  the copy buried the reversible-vs-irreversible distinction at the end of a long
  sentence — rewrote it to lead with that distinction instead.

- [x] **Notification bell disagrees with Board about what "needs attention."** The
  bell's unscoped "Nothing needs a human right now" and Board's "2 unassessed, 1
  unowned" answer different questions (pending approvals/escalations/shadow-agents
  vs. the compliance risk register) but nothing said so. Fix: reworded the bell's
  empty state to name exactly what it covers and points to Board view for what it
  doesn't.

- [x] **Source "kind" dropdown default — investigated, not a bug.** Defaults to
  "unverified," which is exactly the `SourceRecord.tier` column's own backend default
  — a deliberate conservative choice, not an oversight. Removing the default would
  make HTML auto-select the *first* listed option ("Official company data, kept up to
  date") instead, which would silently overclaim trust rather than underclaim it —
  strictly worse. Left as-is.

## Tier 3 — deferred (bigger features, out of scope for this pass)

- [-] No RBAC/team/billing/invite-teammate settings anywhere in the nav, despite the
  product claiming role-based control-plane access (NOM-IAM-04) as a satisfied
  control. Real gap, but a net-new feature, not a navigability fix — flagged as
  backlog, consistent with how net-new-engineering items were scoped out of the
  first audit round.

## Discarded (investigated, not a real issue — tooling artifact this run)

- [discarded] `hometria` typo in guardrails detector copy — grepped the actual source
  (`gateway/app.py`), the string is `pip install 'nometria[presidio]'`, spelled
  correctly.
- [discarded] Escalation conversation row not opening on click — a different persona
  (incident investigator) independently clicked the same row in the same session and
  successfully opened the full transcript.
- [discarded] "the Copilot failure" reference on Entitlement — grepped the actual page
  source, no such text exists anywhere on it.
- [discarded] Kill switch tooltip CSS truncation — native `title=` tooltips can't be
  CSS-truncated; the underlying text was always complete (copy tightened anyway, see
  Tier 2).
- [discarded] Assign Owner save not persisting — reproduced the exact interaction
  directly in a live session; it works and the value persists correctly.

All five discarded items trace back to the same root cause: this session's browser
automation was itself unreliable (stale screenshots, desynced navigation), and every
fresh-eyes agent's own report said so explicitly. None of these were dismissed on
suspicion — each was checked against the real source or a live re-test before being
marked discarded rather than fixed.

---

## Session log

- 2026-08-25 — Four fresh-eyes agents dispatched in parallel against a freshly seeded
  local instance; all four reports collected and synthesized into this tracker.
  Worked through all 7 Tier-1 and 9 Tier-2 items in priority order, verifying each
  against actual source code or live re-testing before treating it as real — five
  didn't survive verification and are logged as discarded with the reason, one
  (evidence-package count "mismatch") turned out to be correct-but-unexplained
  behavior rather than a bug, and the rest were real, root-caused, and fixed:
  `posture()`'s uncomputed-controls undercount (shared root cause behind two
  separately-reported symptoms), the Start-Here-vs-Policies enforcement contradiction,
  the Agent-detail-vs-Escalation data contradiction, a real domain-classifier false
  positive (`"triage"` substring-matching a medical cue), a missing severity filter
  chip, a dead-looking-but-working drift link, an unlabeled seed/demo data problem
  fixed with a new `is_seed` column + migration + badges across four pages, a Glossary
  that decoded codes but not concepts, a genuinely-rendered self-promotional line on
  Compliance my own first grep had wrongly cleared, missing detector-coverage
  disclosure, and a notification bell that answered a narrower question than it
  implied. Full `pytest` suite (1061 passed) green after all backend changes; `npm run
  build` and a live smoke pass against a freshly reseeded server confirm every fix
  renders and behaves as intended. This closes every Tier 1 and Tier 2 item; Tier 3
  (RBAC/billing) remains a documented, deliberate backlog item.
