# Audit tracker — 2026-08-25 three-part audit → fixes

Source: the three-agent audit run 2026-08-25 (backend-vs-UI coverage, PRD-vs-code, fresh-user UX
walkthrough), published as an artifact and summarized in chat. This file is the durable,
checkable record — update it in the same commit as the fix, don't let it drift from reality.

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[-]` intentionally deferred (reason inline)

---

## Part 0 — Shared root causes (fix once, closes several rows below)

- [x] **"Control-plane API unreachable" shown for ordinary 404s.** `ApiDown` (ordinarily meant for
  a real connection failure) is triggered by any thrown error from `api()`, including a 404 from
  a valid backend that's just missing one record. Affects Findings detail, Traces detail, Eval
  run detail, Escalation conversation detail. Fix: `lib/api.ts`'s `api()` should carry the HTTP
  status on the thrown error, and each of the four detail pages should render a "not found" state
  distinct from `ApiDown` when status is 404.
  Done: added shared `NotFound` component (`dashboard/components/ui.tsx`), applied in
  `findings/[id]`, `traces/[id]`, `evals/[key]/runs/[runId]`, `escalation/conversations/[sessionId]`.

---

## Part 1 — Bugs (cheap, high-impact, fix first)

- [x] Escalation conversation detail crashes (via Part 0) on the one real seeded hand-off because
  no turns were recorded for that session — `dashboard/app/escalation/conversations/[sessionId]/page.tsx`.
  Two-part fix: (a) Part 0's 404 handling, (b) seed a real turn history for `seed-refund-dispute-1`
  so the page has something real to show, not just a clean error.
  Done: `src/nometria/seed.py` now records 3 real `ConversationTurn`s for
  `seed-refund-dispute-1` matching the hand-off's own context. Also found and fixed a real bug
  surfaced only by live-testing this: `_handoff_json(handoff)` was missing the `session` arg at
  one call site in `src/nometria/gateway/routes/escalation.py`'s `conversation()` route (stale
  from an earlier signature change). Adding real turns also inflated seed-baseline counts that
  three existing tests hardcoded (`test_a_qualifying_conversation_that_never_escalated_is_detected`,
  `test_the_missed_rate_is_measured_against_qualifying_conversations`,
  `test_the_report_carries_the_headline_metric`) — fixed by scoping those to
  `agent_slug="support-triage"` so they don't pick up the new payments-ops conversation. Verified
  live end-to-end against a fresh seeded server: valid JSON, 3 turns, assessment, hand-off, no
  traceback. Full `pytest` suite green.
- [x] `PolicyEditor.tsx` "Promote to enforce" bypasses `POST /api/policies/simulate` entirely —
  calls the mode-change route directly behind `window.confirm()`. The product's own docs promise
  simulate-before-promote. `dashboard/components/PolicyEditor.tsx:293-303`.
  Done: added a "Simulate against recent traffic" button + result panel; "Promote to enforce" now
  refuses (with an explanatory message, no confirm dialog) unless a simulation has run against the
  exact rules body currently staged — editing the rules after simulating invalidates it and
  requires a fresh run. New proxy route `dashboard/app/api/policies/simulate/route.ts`. Verified
  live: promote-without-simulate blocked, simulate-then-promote proceeds to the confirm dialog,
  editing rules after simulating re-blocks promote.
- [x] Guardrails empty-state copy ("When a detector is wrong, file it") points at a control that
  doesn't exist — `POST /api/guardrails/feedback` has no UI caller. `dashboard/app/guardrails/page.tsx:203-208`.
  Done: built the whole loop, not just the empty-state fix (this doubles as most of Part 3's
  "Guardrail feedback + suppression CRUD" item). A "was this right?" feedback form now sits on
  every detector run in Trace detail (`dashboard/app/traces/[id]/page.tsx`) — required threading a
  new `decision_id` field onto each `detector_runs` entry in `src/nometria/audit/trace.py::full_trace`
  since no FK existed from a detector run back to the decision it fed. Guardrails page gained a
  "Feedback log" section (`GET /api/guardrails/feedback`) with a one-click "suppress 30d" action on
  open false positives, and a "revoke" action on active suppressions. New proxy routes:
  `api/guardrails/feedback`, `api/guardrails/suppressions`, `api/guardrails/suppressions/revoke`.
  Verified live end-to-end: sent real traffic that tripped `injection.heuristic`/`pii.native`, filed
  feedback from Trace detail (confirmed via `GET /api/guardrails/feedback`), suppressed it, saw it
  reflected as an inactive suppression with no revoke button once revoked — all through the actual
  rendered page, not just direct API calls.
- [x] Escalation hand-off queue frames every row as actionable ("someone has to act on it") but has
  no acknowledge control despite `POST /escalation/handoffs/{id}/acknowledge` existing.
  `dashboard/app/escalation/page.tsx:155-220`.
  Done: added an "acknowledge" action, shown only on `status === "pending"` rows, new proxy route
  `dashboard/app/api/escalation/handoffs/acknowledge/route.ts`. Verified live: clicked acknowledge
  on the seeded pending hand-off, confirmed via API that status flipped to `acknowledged`, and the
  rendered page updated (notice banner, status badge, button replaced by "—").
- [x] Agent detail page: Knowledge boundary section shows status "Declared" but renders every field
  in the edit form blank instead of pre-filled — risks silently clearing a real boundary on Update.
  Investigated, does not reproduce: `dashboard/app/agents/[slug]/page.tsx`'s boundary form already
  wires every field's `defaultValue`/`defaultChecked` off the fetched `boundary` object, and the
  fetch (`b.agent === a.slug`) and backend shape (`_boundary_json` in
  `src/nometria/gateway/routes/answerability.py`) already agree on field names. Verified live
  against the seeded `support-triage` boundary: every field (systems_of_record, coverage_months,
  freshness_hours, out_of_scope_topics, answerable_types checkboxes) rendered pre-filled with the
  real saved values, not blank. This looks like a false positive in the original audit rather than
  a real bug — no code change made.
- [x] HITL approval expiry (P2-3) only checked from the bulk `GET /approvals` list route; the
  single-approval poll route the SDK actually calls (`GET /approvals/{id}`) never expires a stale
  approval. `identity/service.py`, `gateway/routes/registry.py:838-880`.
  Done: `get_approval` now calls `expire_stale_approvals(session)` before reading, same as
  `list_approvals` already did. Added
  `test_a_single_polled_approval_expires_without_the_bulk_list_route` in
  `tests/test_policy_and_identity.py`, confirmed red without the fix (asserted `pending` instead of
  `expired`) and green with it — a real regression test, not just a passing assertion.

---

## Part 2 — UX audit, page by page (Audit III)

### `/agents`
- [x] No visible "register an agent" control on the page that most needs one.
  Done: collapsible "+ Register an agent manually" form (slug/name/purpose/owner/risk tier) posting
  to a new `POST /api/agents` proxy route (`dashboard/app/api/agents/route.ts` — the backend route
  already existed, nothing called it). Verified live: registered `billing-support`, saw it appear in
  the table with agent/registered counts updating.
- [x] "Last seen: —" with no explanation that it means no traffic recorded yet.
  Done: `InfoTip` on the column header.
- [x] Jargon with no tooltip: "shadow", "unowned", "lineage edges", "risk tier".
  Done: `hint` added to the `shadow`/`unowned`/`lineage edges` stat cards (risk tier already had
  visible per-row tags, judged not to need a fourth tooltip on top of that).

### `/agents/[slug]`
- [x] Auto-generated risk classification ("Annex III domain: medical" on a support bot) shown with
  no visible reasoning and no correct/reject control.
  Note: the reasoning itself was already visible (the `classification.signals` bullet list) — the
  real gap was the missing action. Fixed together with the next item.
- [x] "Requires human confirmation" stated with no actual confirm/reject control.
  Done: an "Accept — set risk tier to {proposed}" button, shown only when proposed differs from
  current, reusing the existing `PATCH /api/agents/{slug}` route (`risk_tier` field) via the
  already-existing `owner` proxy route — leaving it alone is the reject path, which the panel
  already states via "currently recorded as {current}". Verified live: accepted `support-triage`'s
  proposed `high` classification, confirmed via API and the re-rendered Registration table.
- [x] Knowledge boundary blank-form bug (see Part 1) — investigated, does not reproduce, see Part 1.
- [x] Jargon: "blast radius", "declared vs. observed lineage", "Annex III", "Art. 14/50".
  Done: `InfoTip`s on the blast-radius stat, the Observed-lineage panel note, and the Proposed
  risk classification heading (covering Annex III/Art. 14/Art. 50 together, since they always
  appear together in the generated signal text).

### `/findings`, `/traces`
- [x] Empty states ("Nothing here." / "No traces match.") don't explain why or link back to Start,
  unlike Overview/Start which explain the identical "no traffic yet" condition clearly.
  Done: both now explain the two real causes (no traffic yet vs. filtered to nothing) and link to
  Start here, matching the pattern Escalation's empty state already used.
- [x] Traces intro copy: "substrate policy simulation replays against" — dense, unexplained.
  Done: rewritten to name the thing plainly and link to where it's used (Policies' simulate step).

### `/policies`
- [x] Dense, unexplained jargon: NOM-RTG codes, Art. 12/14/15/50, OWASP LLM01/02, MITRE ATLAS
  codes, library names (Presidio, spaCy, Colang, NeMo, Granite Guardian, garak, pyrit) — no
  glossary anywhere.
  Done: linked to the new `/glossary` page from the page intro.

### `/policies/[key]`
- [x] Plain-language rule builder sits directly above an always-visible raw JSON dump of compiled
  rules with deep nulls — jarring register shift, no framing for the JSON block.
  Done: added a one-line explanation and collapsed the JSON dump behind a
  "Show the compiled rule objects (N)" `<details>` toggle, matching the same
  for-engineers-by-default convention `PolicyEditor`'s raw YAML textarea already uses.

### `/guardrails`
- [x] "File it" dead-end (see Part 1) — done, see that entry.
- [x] Detector table duplicates `/policies`' detector table with a different shape, no cross-link,
  unclear which is authoritative.
  Investigated: the two tables aren't actually duplicates — Policies shows install/availability
  state and simple avg/max latency, Guardrails shows percentile cost for tuning — but nothing said
  so. Added a one-line cross-link on each explaining the distinction rather than merging them.

### `/entitlement`
- [x] "which is the Copilot failure exactly" assumes reader knows the M365 Copilot incident —
  add one clarifying clause. (Otherwise one of the best-explained pages; low priority.)
  Investigated, does not reproduce: no user-visible "Copilot" text exists anywhere on the rendered
  page today — only a code comment. No change made.

### `/evals`
- [x] Red-team posture only offers a CLI command, no in-app trigger — dead end for non-CLI users.
  Done: agent-picker + "Run built-in probes" form, new proxy route
  `dashboard/app/api/redteam/campaigns/route.ts` (backend `POST /api/redteam/campaigns` already
  existed and ran synchronously). Verified live: ran probes against `support-triage`, got a real
  result (11 probes, 8 blocked, 3 got through, 73% posture) rendered in the campaigns table.
- [x] Inconsistent tooltip coverage: SLO row has one, most other stats don't.
  Done: `hint`s added to all four top-row stat cards (suites, recent runs, scorers, red-team
  campaigns).

### `/escalation`
- [x] Broken transcript link (Part 1) — the page's own "click any conversation" instruction leads
  to a crash on the one real seeded row. Done, see Part 1 entry.

### `/compliance` (Controls tab)
- [x] Densest, least-approachable page in the product: 41 controls, `NOM-AUD-01`-style codes,
  `P5-1 P5-6` cross-refs, zero glossary.
  Done: linked to the new `/glossary` page from the page intro. The density itself (41 controls
  in one table) is left as-is — that's a real information density, not confusion; each row
  already shows a plain-language objective and rationale.
- [x] All "not computed" rows give no explanation of what unblocks them.
  Already resolved by earlier task #86 (this session, pre-audit): `status.py`'s rationale strings
  were already sharpened to specific per-control reasons ("No evidence source declared for this
  control", "No enforcement decisions in the window", etc.) and the Controls tab already renders
  `rationale` per row (`dashboard/app/compliance/page.tsx:165`). Verified by reading both sides —
  the audit finding predates that fix landing, or missed it. No further change made.

### `/board`
- [x] No export/print/share control despite being explicitly framed as the artifact shown to
  leadership.
  Done: `PrintButton` client component (`window.print()`) plus `@media print` rules in
  `globals.css` that hide the nav chrome and let panels/cards break cleanly across pages —
  a real "print / save as PDF" flow via the browser's own print dialog, not a screenshot.
  Verified live: button renders, click triggers no console errors.

### Global / cross-page
- [x] `/settings/integrations` and `/settings/tokens` are not in the main sidebar — reachable only
  from the small top-right user menu, despite `/settings/integrations` being the actual
  destination of the prominent "Connect" sidebar link.
  Note: `/settings/integrations` was already in the sidebar (as "Connect") — the original finding
  was self-contradictory on that half. Only `/settings/tokens` was genuinely missing; added as
  "API tokens" next to Connect, plus a matching sidebar icon.
- [x] No in-app glossary anywhere for the `P#-#` / `NOM-XXX-##` / OWASP / MITRE ATLAS coding
  schemes used constantly across Policies, Guardrails, Compliance, Board.
  Done: new `/glossary` page (pillar list sourced from `docs/PRD.md`, NOM-XXX
  prefixes sourced from `src/nometria/compliance_data/controls.yaml` rather than guessed),
  reachable from a persistent sidebar footer link plus explicit call-outs on Policies and
  Compliance (the two densest pages). `/guardrails`'s dense jargon (library names) is covered on
  the same page rather than a separate pass, since it's the same underlying problem.

---

## Part 3 — Dead backend capability (Audit I)

### High severity — build UI
- [x] Kill switch / quarantine: `POST /agents/{slug}/quarantine`, `/kill`, `/resume`,
  `GET /agent-controls` — added to Agent detail page.
  Done: a "Kill switch" panel with state badge, quarantine/resume/kill buttons (single proxy route
  `dashboard/app/api/agents/[slug]/control/route.ts`), and a red banner while non-active explaining
  why and who. Verified live end to end, including that it's real enforcement, not just a UI
  toggle: quarantined `support-triage`, confirmed a real chat-completion call was actually blocked
  (`"Agent is quarantined: testing kill switch"`), resumed it, confirmed the same call went through
  again — all reflected correctly in the re-rendered page each step.
- [x] Policy simulate-before-promote wiring (also Part 1 bug) — `POST /api/policies/simulate`.
  Done, see Part 1 entry.
- [x] Guardrail feedback + suppression CRUD: `POST/GET /guardrails/feedback`,
  `POST/DELETE /guardrails/suppressions` — feedback control on Traces detail (where a detection
  is shown), suppression create/expire on Guardrails page. Done as part of Part 1's guardrails
  "file it" bug — see that entry for detail.
- [-] Identity/credential governance UI (8 routes: `/identities`, capabilities, rotate/revoke,
  delegate, posture) — **deferred**, whole new page, scoping decision belongs to the user
  (does this need its own nav item, or fold into Agent detail?). Tracked, not attempted this pass.
- [x] Approvals inbox: `GET /approvals`, `GET /approvals/{id}`, `POST approve/deny` — new page
  `/approvals` + sidebar link.
  Done: new `/approvals` page with status filter (pending/approved/denied/expired), approve/deny
  forms with an optional rationale field, sidebar entry under Govern. Distinguished in its own copy
  from Escalation's hand-offs (per-tool-call sign-off vs. whole-conversation transfer) since they're
  easy to conflate. Verified live: seeded a real pending approval (`request_approval()` — the same
  path a real `effect: escalate` policy rule triggers), approved it through the actual UI, confirmed
  it moved from the pending filter to the approved filter with the right status.
- [x] Hand-off acknowledge (also Part 1 bug) — done, see that entry.

### Medium severity
- [x] Tool/MCP server registry UI (`/tools`, `/mcp-servers`, `/mcp-servers/{name}/scan`) — folded
  into Agent detail's lineage/MCP context where relevant.
  Scoped down deliberately: a full server-registration + rug-pull-scan management UI is its own
  page-sized feature, not a fold-in — built the lighter version the tracker note actually called
  for instead. Observed lineage rows that target a registered tool now show its impact tier
  (read/write/irreversible) and, when it came through an MCP server, that server's trust level.
  Verified live: called `POST /v1/guard/tool_call` for a real `tickets.create` call, confirmed the
  lineage row rendered with a "write" impact tag next to it.
- [x] Audit chain verify (`POST /audit/verify`) — added to Compliance evidence tab ("verify chain
  integrity" button).
  Done: new proxy route `dashboard/app/api/audit/verify/route.ts`, button + result banner on the
  Evidence & reports tab. Verified live: clicked it, got back
  "chain verified — 0 entries (seq —–—), 0 checkpoint(s), intact" for the fresh seeded DB — the
  real independent re-derivation, not a cached per-package flag.
- [-] `GET /audit/entries` raw browsing, `/audit/checkpoint`, `/export/siem` UI — **deferred**,
  low read value beyond what evidence packages already give; CLI/API already serves this.
- [-] Retention status / legal-hold placement UI (`/retention`, `/legal-holds`) — **deferred**,
  needs its own design pass (where does a legal hold attach — a source? a principal? a data
  class?), not a drop-in table.
- [x] Escalation policy view/edit (`GET/PUT /escalation/policy`) — added to Escalation page.
  Done: owner role / SLA / mode fields plus a raw-JSON conditions textarea (mixed-type dict —
  booleans, ints, a float, a list — not worth a bespoke field-per-condition editor), org-wide by
  default (agent-scoped override exists in the API but isn't exposed in this pass — noted in an
  InfoTip). New proxy route `dashboard/app/api/escalation/policy/route.ts`. Verified: PUT against
  the backend directly (turn_depth 8→10, owner_role, sla_minutes all changed), then reloaded the
  page and confirmed the form re-rendered pre-filled with exactly those new values — the read path
  through the actual proxy route and page, not just the write path.
- [-] `POST /escalation/scan` manual re-scan trigger — **deferred**, confirm with user whether
  this should be a button or a scheduled job before building either.
- [x] `GET /policies/effective` — added to Agent detail (what actually applies to this agent).
  Done: an "Effective policy" panel showing composed mode/default-effect/layers, a per-rule table
  with source and `loosened` provenance, and any rejected rules. Verified live against
  `support-triage`: rendered real composed rules (`injection.direct`, `eu.art14.human_oversight`,
  etc.) with `org:*` source and `extend` mode — the actual P12-3 provenance answer to "why did this
  block?", not a placeholder.
- [-] `GET /policies/lint` org-wide lint surface — **deferred**, low urgency, no current lint
  failures in this environment to demonstrate against.
- [-] `GET /traces/resolve`, `/traces/{id}/links` — **deferred**, marginal value, no evidence of
  demand yet.
- [-] `POST /answerability/report` — **deferred**, mirror of Escalation's report pattern but no
  page currently asks for it.

---

## Part 4 — PRD gaps (Audit II)

### Wiring gaps — real logic exists, needs a route + UI (do these)
- [-] **P13 Failure attribution** (`attribution.py`) — add `GET /api/traces/{id}/attribution` (or
  similar) route + a panel on Trace detail showing blame assignment / handoff fidelity when a
  trace involves a subagent handoff.
  **Deferred after investigation**, unlike the other three items in this section — this one turned
  out not to be pure wiring. `handoff_fidelity(parent_instruction, child_instruction, ...)` and
  `attribute(trace, value, failed_step)` are real and tested, but both need data the running system
  doesn't currently capture: `handoff_fidelity` needs the actual instruction *text* passed at each
  delegation hop (to diff which constraints survived), and the only delegation record that exists
  today, `DelegationEdge`, stores a capability-narrowing diff, not instruction text. `attribute`
  needs a `list[{id, actor, inputs, output}]` trace shape that doesn't correspond to anything our
  `Span`/`Decision` models currently populate. Building a route on top of either would mean
  fabricating the missing data or silently reporting nothing for every real trace — worse than not
  building it. The honest fix is instrumentation (capture instruction text at delegation, or a step
  log shaped for `attribute`), which is a data-model decision belonging with the other net-new
  items below, not a same-pass wiring job. Tracked here rather than silently dropped.
- [x] **P14 Context & retrieval integrity** (`context_integrity.py`) — wire the ingestion/chunk
  quality gate into the retrieval enforcement path (or at minimum a `POST /api/context/check`
  route + surface on Sources or a new panel) so it stops being dead code.
  Done via the lighter option, deliberately — an inline retrieval-path gate is a real design
  decision (what happens on reject: block the retrieval, quarantine the chunk, just log it?) that
  belongs to the user, not something to bolt on silently. Built `POST /api/sources/context-check`
  (`document_quality`/`chunk_quality`, both pure functions needing no new instrumentation) and a
  "Check ingestion quality" panel on `/sources` — paste extracted text or chunk boundaries, get the
  same findings a governed pipeline would produce. Verified live: pasted real mojibake text
  (`â€™`-style UTF-8-as-latin-1 corruption) through the actual rendered page, got back
  `score 0.4, usable: false, mojibake` — the real detector, not a stub. `docs/status.md`'s P14 note
  updated in the docs-hygiene pass above to say plainly that no enforcement path calls this yet.
- [x] **Ragas adapter** (`evaluation/ragas_adapter.py`) — add as a selectable scorer in the eval
  run form (`dashboard/app/evals/[key]/page.tsx` scorer checkboxes) when the `ragas` package is
  installed.
  Done: 4 new `Scorer` classes (`ragas_faithfulness`/`ragas_answer_relevancy`/
  `ragas_context_precision`/`ragas_context_recall`) registered in the same scorer registry as
  everything else — the dashboard's scorer checkboxes are already driven by `GET /api/eval/scorers`
  (`all_scorers()`), so **no frontend change was needed at all**, just registering the scorers
  server-side. Each falls back to the native lexical approximation `ragas_adapter.py` already had
  when the real `ragas` package isn't installed (reported via `implementation` in the result
  detail), so the scorers are always usable rather than conditionally hidden. Verified live: all
  four appear in the real run form's checkbox list, and a direct scorer call against a real
  question/answer/context sample returned a correct score.
- [x] **Policy hierarchy exposure** — `PolicyEditor`/`POST /api/policies` only send
  `body/notes/mode`; every saved policy silently defaults to `level="org"`. Add level/scope
  fields to the save form so the real engine underneath is actually reachable.
  Done: `PolicyIn` gained `level`/`scope_id`/`compose` (validated against the engine's own
  `LEVELS`/`MODES`), `GET /api/policies/{key}` now returns the current binding's placement so the
  form can pre-fill it, and `PolicyEditor` gained a "Where does this apply?" control (level select,
  scope glob input, compose select) with an `InfoTip` explaining the org→team→agent→user hierarchy
  and what extend/restrict/override mean. While wiring this I found and fixed a real latent bug in
  `save_policy` it would have made worse: the "no-op edit" fast path only compared rule-body text,
  so a save that changed *only* level/scope/compose (same rules) silently updated nothing — proven
  with a regression test (`test_changing_hierarchy_placement_alone_rebinds_without_a_new_version`)
  confirmed red without the store.py fix, green with it. Verified live: saved `baseline` with
  `level=team, scope_id=finance` via the real route, confirmed it persisted via `GET`, and confirmed
  the rendered page's own select pre-fills "team" on reload — the actual read path, not just the
  API.

### Correctness fixes (small, do these)
- [x] P2-3 approval-expiry latent bug (Part 1) — done, see that entry.

### Net-new engineering — large scope, tracked but not attempted this pass
- [-] P12-6 Canary rollout with health gates for policy promotion.
- [-] P12-7 Non-developer policy authoring (wizard/plain-language builder beyond the existing
  rule-builder-plus-raw-YAML hybrid).
- [-] P4-10 Model-based groundedness (HHEM/Granite) to replace token-overlap groundedness.
- [-] P4-11 Annotation/human-review queue for eval labeling.
- [-] P4-12 Dataset health (staleness/coverage/drift-of-dataset, distinct from model drift).
- [-] P6-9 Dynamic risk scoring engine (current scoring is static, set once).
- [-] P6-10 Assessment/workflow engine (state machine + approval routing for risk assessments).
- [-] P13-4/5/6 Error-propagation detection, turn-depth quality curve, regression attribution.
- [-] P15-4 Backpressure queueing (`AdmissionController` in `availability.py` is fully built —
  this one is cheaper than the others on this list; revisit before the rest).
- [-] P15-5 Cost attribution beyond agent-level (team/user/session/tool dimensions).
- [-] P9-8 Idempotency keys in the action-assurance path.
- [-] P1-8 Cloud connector framework for agent discovery (Bedrock/Azure/Vertex/Snowflake/etc.).
- [-] P2-8 Entra Agent ID / Okta integration.
- [-] P8-9 Catalog ingestion (DataHub/OpenMetadata/Unity).
- [-] I-12 Retrieval-scope adapters beyond native ACL (Qdrant/Pinecone/pgvector/etc.).

**Rationale for the net-new list:** each of these is a genuine subsystem (external IdP protocol
support, a state-machine workflow engine, a rollout/health-gate system, a different scoring
model) that needs its own design decision before code, not a UI-wiring pass. Flagging them here
so they don't quietly disappear from view, but building them wasn't part of "fix the known
issues" — it's new product work.

### Docs hygiene
- [x] PRD pillar-header symbols (P7, P9, P10, P11, P15 sections) contradict their own body text
  a few lines below ("✗" header, "✅ shipped" prose) — reconcile in `docs/PRD.md`.
  Done: P7 and P11 headers → ✅ (body already claimed full coverage), P9 and P10 → ✅◐ (body
  claims shipped with one named gap each), P15 → ◐ and its body text corrected too — it claimed
  "nothing enforces, no fallback, no circuit breaker" which was itself false: `availability.py`
  has a real fail-open/fail-closed degradation policy and a priority-aware rate
  limiter/load-shedder (`AdmissionController`, P15-4). Rewrote the body to say what's actually
  there (those two) versus actually missing (per-provider circuit breaker, TPM/RPM caps,
  cost attribution beyond agent-level, LiteLLM adapter) instead of a blanket ✗.
- [x] `docs/status.md` P4 note says "no Ragas adapter" — wrong, one exists; update note to say
  "built, not reachable from any route" instead. Done.
- [x] `docs/status.md` P14 note ("gates the ingestion and assembly path") overstates current
  state — update once P14 wiring above lands, otherwise correct the note now to say "no gate
  currently in the running system." Done: confirmed zero call sites into `context_integrity.py`
  outside itself, corrected the note to say so plainly.

---

## Session log

- 2026-08-25 — Tracker created from the three-audit artifact. Starting execution: Part 0 → Part 1
  → Part 2 → Part 3 (high severity) → Part 4 (wiring gaps) → deferred items get a one-line
  rationale each rather than being silently dropped.
- 2026-08-25 — Part 0 and all 6 Part 1 bugs closed (5 fixed, 1 — the knowledge-boundary blank-form
  bug — investigated and found not to reproduce; documented in place rather than silently dropped).
  Building the guardrail feedback/suppression bug also finished most of Part 3's matching
  high-severity item, so that row was marked done too. Backend fixes along the way: `_handoff_json`
  missing-arg bug, a new `decision_id` field on `detector_runs` (needed to link a feedback form back
  to the decision it fed), and the `GET /approvals/{id}` expiry gap with a regression test proven
  red/green. Full `pytest` suite green after every step; `tsc --noEmit` clean; every fix verified
  against a live seeded server, not just code review — the escalation and PolicyEditor fixes in
  particular surfaced bugs (stale call site, missing `session` param) that static reading missed.
  Next: Part 2 (UX fixes page by page).
- 2026-08-25 — Part 2 closed: all 20 items across every page in the audit. New: manual
  agent-registration form, a risk-classification accept control, a `/glossary` page (content
  sourced from the real PRD/controls catalog, not invented), a working in-app red-team trigger
  (verified live — 11 probes run against a real agent), a print/PDF export on Board view, clearer
  empty states on Findings/Traces, a collapsed compiled-rules JSON view on Policy detail, and
  cross-links between the two detector tables (Policies vs Guardrails) that turned out to show
  different things, not duplicate the same thing. Two findings turned out to be false positives on
  investigation (the Copilot copy referenced no longer exists; `/settings/integrations` was already
  in the sidebar as "Connect") — documented rather than silently skipped. Full `pytest` suite
  (1060 passed) and `npm run build` both green; every UI change checked live against a running
  seeded server. Next: Part 3 (build UI for the remaining high-severity dead routes — kill
  switch/quarantine, approvals inbox; the guardrail-feedback item already landed in Part 1).
- 2026-08-25 — Part 3 closed: every non-deferred item. Kill switch/quarantine/resume on Agent
  detail, verified as *real* enforcement (quarantined `support-triage`, confirmed a live chat
  completion was actually blocked, resumed it, confirmed it went through again — not just a UI
  toggle). A new `/approvals` inbox page, distinguished from Escalation's hand-offs in its own copy
  since the two are easy to conflate; verified by seeding a real pending approval via
  `request_approval()` (the same path a real `effect: escalate` rule triggers) and approving it
  through the actual UI. Three medium-severity items: on-demand audit-chain verify on Compliance,
  an escalation-policy editor (scalar fields plus a raw-JSON conditions textarea — the dict is
  genuinely mixed-type, not worth a bespoke field per condition), and an "Effective policy" panel
  on Agent detail surfacing per-rule provenance (source/mode/loosened) via the existing P12-3
  engine. Tool/MCP registry UI was deliberately scoped down from a full management page to
  impact/trust-level annotations on the Observed lineage table, matching what the tracker's own
  note called for rather than building a bigger feature nobody asked for. Full `pytest` suite
  (1060 passed) and `npm run build` green; every item verified live, several by calling the
  underlying enforcement/detection paths directly (not just the CRUD routes) to prove the UI
  reflects real system behavior, not just database state. Next: Part 4 (PRD wiring gaps + docs
  hygiene) — the last part of the audit tracker before final verification.
- 2026-08-25 — Part 4 closed: every non-deferred item. **Ragas adapter wired** — 4 scorers
  (faithfulness, answer relevancy, context precision, context recall) registered against the
  existing `Scorer` protocol in `evaluation/ragas_adapter.py`; because the eval-run form's scorer
  checkboxes are already driven dynamically off `GET /api/eval/scorers`, this required zero
  dashboard changes — verified live that all 4 appear in the real form and a direct scorer call
  against a real sample scores correctly. **Policy hierarchy exposed** — `PolicyEditor` gained a
  "Where does this apply?" block (level/scope/compose) wired through `POST /api/policies`;
  surfaced a real, previously-undiscovered bug while doing this — `save_policy()`'s no-op-edit
  fast path only compared rule-body text, so a save that changed only the hierarchy placement
  (same rules, different level/scope/compose) silently skipped creating a new `PolicyBinding`.
  Fixed by separating version-reuse from binding-reuse in `policy/store.py`; proved with a
  red/green regression test (`git stash` on the fix reproduces `assert 'org' == 'team'` failing).
  **P14 context-integrity gated at the edge** — new `POST /api/sources/context-check` route plus
  a `ContextCheck` component on the Sources page, so `context_integrity.py`'s `document_quality`/
  `chunk_quality` (previously built and tested but never reachable from any route) can actually be
  used as a pre-ingestion dry run; verified live with real mojibake text producing a correct
  rejected/score-0.4 result end to end. **P13 (failure attribution) deliberately deferred** — the
  underlying functions are real and tested but need data shapes (per-step trace actor/input/output
  lists, per-hop delegation instruction text) that no current model actually populates; wiring a
  route today would either fabricate data or silently report "nothing" against every real trace,
  so this was left as a documented, honest gap rather than forced. **Docs hygiene**: fixed 5
  header/body symbol contradictions in `PRD.md` (Pillars 7, 9, 10, 11, 15 — the
  Pillar 15 fix went further than the symbol, rewriting a body claim that inaccurately said
  nothing enforces degradation when `availability.py`'s `service_fallback` and `AdmissionController`
  are real, tested implementations), and corrected two overstated rows in `status.md` (P4 Ragas,
  P14 context-integrity) to reflect exactly what's wired vs. still isolated. Full `pytest` suite
  (1061 passed) and `npm run build` green. This closes every part of the 2026-08-25 three-part
  audit tracker except the deliberately-deferred items documented inline throughout (P13
  attribution above; net-new-engineering items noted as out-of-scope for an audit-fix pass in
  their original entries).
