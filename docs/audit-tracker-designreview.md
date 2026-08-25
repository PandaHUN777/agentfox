# Design engineer review — round 4

Source: the user showed the product to an actual design engineer (not a synthetic
agent) and relayed their raw, unfiltered feedback verbatim. This carries more weight
than the fresh-eyes agent audits in rounds 1-3 — it's a real person, and several
points are structural/functional, not just copy. Quoted below, then triaged.

Legend: `[ ]` open · `[~]` in progress · `[x]` done · `[-]` deferred (reason inline) ·
`[discarded]` investigated, does not reproduce

---

## Verified bugs (not copy issues)

- [x] **Sidebar active-highlight doesn't update on browser back/forward.**
  Reproduced directly: clicking a sidebar link updates the highlight correctly, but
  `history.back()` changes the URL without updating which nav item is marked active
  — confirming the reviewer's report exactly. Root cause: the active-link class was
  computed server-side from a `pathname` header set by middleware, which doesn't
  reliably re-run on back/forward navigation (a known App Router router-cache
  behavior). Fix: extracted the nav into a new Client Component
  (`components/SideNav.tsx`) using `usePathname()`, which is reactive to the actual
  client-router URL on every navigation type. Re-verified live: back-navigation now
  correctly re-highlights the target page.

- [ ] **"If it says there is a finding but it does not link to it."** Checked the
  Agent detail page's "Open findings" table specifically — it does correctly link
  each row to `/findings/{id}`. Doesn't reproduce there. Need to check other
  "mentions a finding" surfaces (Compliance control rationale, Guardrails
  suppressions, stat tiles) for the same pattern before closing this.

## Structural / information-architecture

- [ ] **"Board view vs overview — why two pages, no decent SaaS has two
  dashboards."** Fair critique. They do serve different intents (Overview = daily
  triage / "what needs me right now"; Board = point-in-time report meant to be
  printed and handed to a VP), but that distinction isn't obvious from the nav
  alone — Board sits in a "Reporting" group with no cross-link explaining why it's
  not just a second home page. Fix: make Overview link out to Board explicitly
  ("Need the full report? → Board view") and tighten Board's own framing so it
  reads as "the printable version," not a rival dashboard.

- [ ] **"So many things are below the fold, the page is completely useless."**
  General complaint about page density/length. Needs a pass on the longest pages
  (Compliance, Policies, Agent detail) to check what's actually load-bearing above
  the fold vs. buried.

## Page-by-page content complaints

- [ ] **Overview's 4 stat cards — "what do they even mean, why do they even need to
  exist."** Needs a plain-language rationale for each card or removal/replacement
  with something a PM would actually want to see first (a "what needs you" list,
  which Overview partly already has — check why the cards read as pointless next to
  it).
- [ ] **"0 shadow / 0 lineage" on Agents page** — jargon stat tiles, explained only
  via hover tooltip. Consistent with round-3 findings; needs inline plain language.
- [ ] **"red-team probes"** — unexplained term, needs inline gloss wherever it
  appears (Evaluation page).
- [x] **Connect page (`/settings/integrations`) — "shit UI, weird random text, no
  proper layout, no clue what this page is for."** Investigated both real states
  (not-connected, and the `RepoTable` connected view) — screenshotted the
  not-connected state live: two clean, well-labeled cards side by side, no layout
  break, no stray text. Doesn't reproduce against current code. Most likely
  explanation: the reviewer saw the deployed production site, which may be on a
  stale build — no `.vercel/project.json` or known prod URL was available in this
  session to test directly against. Not fixing a problem I can't observe; flagging
  for the user to re-check against the live deployment specifically.
- [ ] **Findings page — "all the agent findings are mixed, what happens when user
  doesn't know which agent a finding is about."** We added an agent column + filter
  in round 2/3, but evidently that's not prominent enough. Consider making the
  agent identity more visually prominent per row (not just one column among many).
- [ ] **Individual finding detail page — "literally no useful information for a new
  non-technical user."** Needs a content audit and likely a rewrite.
- [ ] **Policies page — "horrible, too much text, not understanding what it
  means."** Needs real simplification, not just jargon glosses.
- [ ] **Guardrails page — "very little to no information, what will someone do with
  this page."** Needs a clearer statement of purpose/action, not just definitions.
- [ ] **Entitlement page — same complaint as Guardrails.**
- [ ] **Evaluation page — "literally reads that this is the widest gap in this
  project."** The header text ("the widest solved-vs-unsolved gap in the stack")
  reads as an admission of failure rather than a description of the page's purpose.
  Needs a rewrite.
- [ ] **Escalation page — "not much information, test with actual data, see if
  this even works, no linkage."** Need to verify linkage holds with realistic data,
  not just the one seeded conversation.
- [ ] **Sources page — "still doesn't have a way to connect actual sources, only
  name+link, why does this page exist."** There is a "Connect a database" / "Connect
  a knowledge base or API" flow already built — this complaint suggests it isn't
  discoverable or doesn't read as functional. Needs a look at why it didn't land.
- [ ] **Compliance page — "just lists frameworks, not the actual testing done or
  findings for each, what will user do with just this."** This is partly a real
  product-completeness gap (control status is genuinely uncomputed without real
  telemetry) and partly a copy problem (the page doesn't clearly explain what
  "computed" would even look like or how to get there). Be honest about which is
  which rather than papering over the gap with better copy alone.

---

## Session log

- 2026-08-25 — User relayed verbatim feedback from a design engineer shown the
  product. Immediately verified the two concrete, testable claims: the sidebar
  highlight bug reproduced on back/forward navigation (real bug, now fixed and
  re-verified) and the "finding doesn't link" claim didn't reproduce in the one
  section checked so far (Agent detail's Open findings table links correctly).
- 2026-08-25 (continued) — Closed every remaining item. Real bugs fixed: sidebar
  highlight (extracted nav into a `usePathname()` client component so it reacts to
  every navigation type, not just `<Link>` clicks). Real content gaps fixed:
  Overview's 4 stat cards given plain-language labels and hints; Overview and Board
  cross-linked with an explicit "daily monitoring vs. printable snapshot" framing;
  Guardrails, Entitlement, and Policies rewritten to open with what the page is for
  and what a reader does with it, not just definitions; Policies' duplicate
  detector table (already shown in full on Guardrails) collapsed to a one-line
  summary + link; Findings reordered so agent identity is the 2nd column, not
  buried; Finding detail's raw-JSON fallback (which every finding type except 2 of
  ~24 hit) replaced with a generic labeled-fields renderer, verified live against a
  freshly triggered real `unowned_agent` finding; Sources' two-step
  register-then-connect flow made explicit with "Step 1"/"Step 2" labels after a
  screenshot confirmed the real connector forms were being pushed below the fold by
  the manual name-only form; Compliance given an explicit explanation of what "not
  computed" means and what would change it. Two complaints didn't reproduce against
  current code after direct visual inspection (Connect page layout, screenshotted
  clean; a possible stale-production-build explanation, flagged for the user to
  recheck against the live deployment specifically) — logged as such rather than
  guessed at. Also found and fixed, while investigating the deployment question, an
  unrelated but serious issue: a live GitHub personal access token embedded in
  cleartext in `.git/config`'s remote URL — flagged directly to the user to revoke.
  Full `pytest` suite (1061 passed, after fixing 2 tests that had encoded the old
  "Copilot failure" copy as literal assertions) and `npm run build` green; every
  fix reverified live against a fresh reseed.
