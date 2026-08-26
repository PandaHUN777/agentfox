# Nometria — PRD v4 Addendum
## Memory governance, inter-agent security, and dashboard UX — next tranche

| | |
|---|---|
| **Version** | 4.0 — addendum, not a rewrite |
| **Date** | 2026-08-26 |
| **Status** | Proposed |
| **Extends** | [PRD v3](PRD-v3-consolidated.md). Pillar numbering, control-code prefixes and failure-family IDs continue v3's scheme rather than restarting it. |
| **Sources** | (1) OWASP Top 10 for Agentic Applications 2026, read in full; (2) live code verification against two subagent passes, not memory; (3) UX/product review of Decawork (`decawork.ai`, funded competitor) and EVO (`evo-hq/evo`, Apache-2.0, code read directly) |

> Three independent research threads converged on this turn. Two are external competitive
> review; one is a public security taxonomy. Where a finding from the taxonomy matched
> something this project's own [enterprise-infrastructure-analysis.md](enterprise-infrastructure-analysis.md)
> had already flagged and never built, that gets first billing below — convergent evidence
> from an outside standard and this project's own prior research is a stronger signal than
> either alone, which is the same standard §8.2 Tier 4 of PRD v3 used.

---

## Part I — Security: OWASP Agentic Top 10 2026 gap analysis

### 1.1 Correction to the record before adding anything new

`docs/coverage-map.md` line 66 currently claims:

> `L2.12` Memory contamination across sessions — **✅ covered** — *tenancy isolates storage;
> P14 binds memory to its subject*

Verified against the actual code (`src/nometria/context_integrity.py:508–615`,
`tests/test_context_integrity.py:236–265`): `memory_binding_breach()` is a **stateless pure
function**. It takes `entries: list[dict]` supplied fresh by the caller on every call, plus a
`principal` string, and checks `entry["subject"]` against `principal`. There is no `Memory`
table in `models.py` (52 tables, none named `Memory` — closest are `SourceRecord`,
`KnowledgeBoundary`, `TaintTag`). Nothing is durably stored, queried over time, or checked for
poisoned content. `durable` is a boolean the caller sets on its own input dict, not a TTL.

This is exactly the failure mode the project's own docs warn about — *"a hand-written status
table drifts within a week and then quietly lies"* — just found from the outside this time.
**Action: correct L2.12 to ◐ partial** (subject-binding on caller-supplied data is real and
useful; persistent memory-store governance is not built) the same day this addendum lands,
independent of whether P16 below gets scheduled.

### 1.2 P14 extension — memory write-path governance (closes ASI06, F8.3)

**What's missing, precisely.** `assess_context()` checks documents, chunks and retrieval that
arrive as call arguments. Nothing in the pipeline governs the *write* into whatever an agent
uses as long-term memory (a vector store, a `mem0`-style store, a LangGraph checkpointer) — no
content validation before a write commits, no cross-tenant isolation check on the store itself
(only on the caller-supplied dict), no provenance weight on a retrieved memory entry, no expiry
for an entry nobody has verified.

This is **F8.3**, the one mode `status.md` already lists as not covered inside the 5.5/7 F8
score, and it is **OWASP ASI06 Memory & Context Poisoning** verbatim: RAG/embedding poisoning,
shared-context poisoning, long-term memory drift, cross-agent memory propagation. It is also
independently `enterprise-infrastructure-analysis.md`'s **Gap 6**, written before this
addendum: *"no write-validation, no provenance on stored facts, no TTL, no quarantine and no
way to find and remove a bad memory."* Three sources, same hole.

**Proposed control — `NOM-RTG-09` Memory write validation.**
- A `MemoryWrite` decision surface, parallel to `guard_content`/`guard_tool_call`: every write
  to a store an agent will later retrieve from goes through the same detector pipeline
  (injection, secrets, PII) *before* it commits, not just at retrieval time. A poisoned entry
  that would be blocked on the way *out* should not be free to persist on the way *in*.
- Provenance carried on the entry itself (who/what wrote it, at what taint level) so retrieval
  can weight or refuse a memory entry the same way `P8` already weights a source tier — a
  memory entry written from `tool_result`-tainted content is not the same trust level as one
  the end user typed directly.
- `expires_at` on unverified entries, defaulting closed (an entry nobody has confirmed decays
  rather than persisting indefinitely) — the direct fix for "no way to find and remove a bad
  memory."
- Cross-tenant isolation enforced on the store, not only on the dict the caller happened to
  pass in — reuse the existing `TenantScoped` pattern (`PL-8`) rather than inventing a second
  mechanism.
- Migration: `memory_entries` table (id, tenant, agent, subject/principal, content, taint
  source, provenance, written_at, expires_at, verified_by). Reuses `TaintTag`'s taint-source
  vocabulary rather than a new one.

**Effort:** M. The detector pipeline, taint vocabulary, tenancy pattern and P8-style tiering
all already exist — this composes them onto a new write path rather than building primitives
from zero.

### 1.3 New pillar — P17 Inter-agent communication security (closes ASI07)

**What's missing, precisely.** Every `surface` value in the enforcement pipeline is
`input`/`output`/`tool_args`/`tool_result`/`retrieved` (verified: `enforcement.py`,
`autoguard.py`, `integrations/langgraph.py`, `integrations/mcp.py`,
`evaluation/redteam.py`). Sub-agent output is folded into `tool_result`
(`enforcement.py:1300–1304`, `"subagent" → "tool_result"`) — agent-to-agent traffic gets the
same governance as a tool call, not a governed boundary of its own. There is no message
signing, no replay protection, no agent-card attestation anywhere in `enforcement.py` or
`registry/`. This is **OWASP ASI07** entire: unauthenticated inter-agent channels, replay on
trust chains, protocol downgrade, agent-card forgery.

P17 matters more for Nometria specifically than it would for a single-agent product, because
the product's own positioning already claims multi-agent framework coverage (CrewAI,
LangGraph, AutoGen) and its own red-team suite already probes `injection.tool_result` for
sub-agent output — the taxonomy this pillar needs mostly already exists one layer up.

**Proposed control — `NOM-IAM-08` Inter-agent message integrity.**
- A genuine `agent_message` surface, distinct from `tool_result` — a sub-agent's output is
  evaluated as *another agent's untrusted claim*, not as *a tool's return value*; the taint
  ceiling and the detector set can then differ (message-tampering and role-delimiter checks
  matter here in a way they don't for a REST response body).
- Message signing + verification for A2A traffic where the transport is Nometria's own
  (`nometria.auto()`-wrapped multi-agent calls): HMAC over payload + declared sender + nonce +
  timestamp, checked before the message enters enforcement. Where the transport is external
  (a customer's own A2A/MCP bus), Nometria reports **unsigned** as a finding rather than
  silently passing it — same "declare the gap, don't hide it" convention P14 already uses for
  what it doesn't check.
- Anti-replay: short-term fingerprint cache keyed on (sender, nonce), rejecting a repeated
  message inside its validity window — the concrete fix for ASI07's "replay on trust chains."
- Agent-card fields (declared identity, declared capability set) checked against the sender at
  message time, reusing `attest_registry()`'s declared-vs-observed comparison rather than a
  second attestation mechanism.

**Effort:** M/L. The new surface and detector wiring is straightforward reuse of existing
machinery; the signing/verification path is genuinely new plumbing (key management for
per-agent signing keys is the long pole, not the enforcement logic).

### 1.4 Lower-priority hardening — extend existing pillars, don't create new ones

These are real per OWASP but neither urgent nor structurally missing — they extend controls
that already exist rather than opening new gaps:

- **ASI04 supply-chain signing (extends P1/registry).** `scan_mcp_server()` already computes a
  SHA-256 digest for drift comparison and flags `unpinned_server`/`mcp_schema_drift` — hygiene
  and drift detection, not cryptographic verification. Adding actual signature verification
  (require a signed manifest, reject unsigned on a configurable policy) is real work but is
  additive to `registry/service.py`, not a new pillar.
- **ASI10 behavioral attestation (extends P11/registry).** `attest_registry()` already does
  declared-vs-observed drift detection and raises `registry_drift` — after-the-fact, not
  continuous. OWASP wants periodic signed re-attestation; the honest framing is "drift
  detection exists, attestation cadence does not," which is a parameter on existing machinery,
  not new architecture.
- **ASI05 Unexpected Code Execution — declared non-goal, not a gap.** Nometria governs the
  interface into a tool call; it does not sandbox the agent's own code-execution runtime. That
  boundary is real and should be stated explicitly in §10.3 Non-goals of PRD v3 rather than
  left implicit — an honest declared gap is worth more than silence, which is the same
  discipline the DraftCaveat and framework-mapping gaps already follow elsewhere in this
  product.

### 1.5 Control catalog additions (Appendix B format)

| Control ID | Description | Pillar | Evidence | Agentic Top 10 | Agentic Threats T-code |
|---|---|---|---|---|---|
| **NOM-RTG-09** | Writes to agent memory/long-term context are validated by the detector pipeline and carry provenance before they commit; unverified entries expire. | P14 | `MemoryWrite` decision (new) | **ASI06** | T1 Memory Poisoning |
| **NOM-IAM-08** | Inter-agent messages are evaluated on a distinct surface, signed where the transport is ours, and rejected on replay. | P17 (new) | `agent_message` decision (new) | **ASI07** | T12 Agent Communication Poisoning, T16 Insecure Inter-Agent Protocol Abuse |

### 1.6 Failure-family and status.md updates this implies

- `F8.3` moves from *not covered* to *covered* once §1.2 ships — F8 goes from 5.5/7 to 6.5/7.
- `L2.12` in `coverage-map.md` corrects from ✅ to ◐ **immediately**, independent of build
  order (§1.1) — documenting a known gap correctly is not gated on fixing it.
- A new `P17` row joins `status.md`'s pillar table once work starts, `◐ partial` until the
  signing path lands.

---

## Part II — Dashboard UX: complexity audit against two competitors

The complaint that prompted this section was not vague — *"we are over complex and shitty ui,
they are much more cleaner and optimized."* That deserved evidence, not a defense, so the live
product was screenshotted page by page (Overview, Guardrails, Approvals, Compliance) and
compared directly against Decawork's mockup and EVO's dashboard rather than judged on taste.
The complaint holds. Three concrete, repeating patterns, ranked by how much they actually cost
a reader — not five items of undifferentiated "polish."

### 2.1 Confirmed broken — fixed this turn

**Table cells holding raw, unsummarized backend text.** Two live instances, same root cause:
the UI printed exactly what the API returned instead of summarizing it and pushing detail
behind a click.

- `/approvals` — the `reason` column concatenated every fired policy rule's full sentence with
  `"; "`. A real row ran to **seven lines** next to five one-line columns
  (`dashboard/app/approvals/page.tsx`, `a.reason` rendered raw). **Fixed:** shows the first
  rule's reason, truncated to one line, plus a `+N more` count; full text on hover — the same
  summary-first split the table already used for `arguments` one column over.
- `/guardrails` — every `unavailable` detector printed its `unavailable_reason` as a permanent
  3–4 line paragraph inline in the table, whether the reader asked or not
  (`dashboard/app/guardrails/page.tsx`). **Fixed:** moved into `InfoTip`, the click-to-reveal
  component this session already built for exactly this job and had sitting unused right next
  to the bug. Nine detector rows now render at uniform one-line height; on the live page this
  cut the table's rendered height by roughly half.

Neither fix removed information — both moved it from *always visible* to *available on click*,
which is precisely the "summary visible, detail on demand" split Decawork's inline-expand audit
rows and EVO's collapsible panel already validate (§2.3 below). This is the general fix, not
two isolated patches: **any table cell whose content is a sentence rather than a value is the
same bug**, and it is worth a pass over every table in the app, not just these two.

### 2.2 Confirmed, not yet fixed — a design call, not a bug

**Compliance is the worst offender and needs a decision, not a patch.** Before a reader reaches
the actual controls table, the live page renders, in order: an intro paragraph, a yellow
"framework mappings are DRAFT" banner, **seven** stat cards across two rows, a tab bar, a
color legend, and a second blue "41 of 41 controls have never been computed" callout — six
distinct scaffolding elements before any real content
(`dashboard/app/compliance/page.tsx`). Compare to Decawork's own product-preview mockup, which
goes from a tab bar straight into a dense table, or EVO's topbar stat-strip, which states four
numbers with no explanatory sentence attached because the labels ("Best Score," "Active") don't
need one.

Proposed cut, in order of confidence:
1. Merge the two callout boxes into one — the DRAFT warning and the never-computed note say
   related things and currently cost two full-width boxes.
2. Cut the stat-card row from seven to the three that drive a decision (controls / not
   computed / effective) and move the rest behind a click, same pattern as §2.1.
3. Replace the legend row with a single `InfoTip` on the "status" column header — the four
   color dots are exactly the kind of "explain a UI convention once" job `InfoTip` exists for.

This one is held for confirmation rather than shipped, because unlike §2.1 it is not a table
cell rendering the wrong thing — it is a genuine editorial call about how much scaffolding a
compliance officer needs before the numbers, and that is worth a yes rather than an assumption.

### 2.3 Nav density

Sixteen flat sidebar items across five unlabeled-weight groups, versus Decawork's seven-item
nav or EVO's near-absent sidebar (a topbar carries the state instead). Not fixed — reducing nav
surface usually means consolidating pages, which is a bigger call than a table-cell fix and is
flagged here rather than acted on unilaterally.

### 2.4 Additive polish, not fixes

Distilled from the earlier live review of Decawork and EVO's dashboard source
(`plugins/evo/src/evo/static/`). None of these were broken — they're patterns worth adopting,
ranked by functional value rather than cosmetics.

| # | Item | Source | What it is |
|---|---|---|---|
| 1 | **Inline-expandable trace/finding rows** | Decawork's Audit tab | Click a row to expand Arguments / Rule fired / Approver / Upstream response in place, no navigation. Nometria's Traces/Findings always jump to a full detail page — fine for a deep dive, slower for "scan twenty, look closely at one." Directly generalizes §2.1's fix from "shrink the cell" to "expand the row." |
| 2 | **Countdown-style expiry** | Decawork's token table | "7h 12m" instead of a static timestamp, on anything time-boxed: `/settings/tokens`, Guardrails suppressions, Approvals `expires_at`. |
| 3 | **Persistent stat-strip in the topbar** | EVO's `#topbar` | Best Score / Experiments / Frontier / Active, always visible regardless of scroll — not buried in page-body cards. |
| 4 | **Collapsible/resizable docked panel, state persisted** | EVO's score-over-time chart | Drag-to-resize, collapse-to-bar/expand/maximize, choice remembered in `localStorage` across sessions. |
| 5 | **Approval-tag color** | Decawork's decision badges | Orange, not amber, for "requires approval" — reads more urgent, avoids the generic-warning-yellow cliché. Cosmetic. |

---

## Part III — Roadmap and priority

Ordered the same way PRD v3 orders everything: **whether it closes a real, evidenced gap**,
not by how interesting it is to build.

### Tranche 5 — memory and inter-agent security
`NOM-RTG-09` memory write governance (§1.2) · correct `L2.12` in coverage-map.md (§1.1, ship
first — it's a one-line doc fix, do it before anything else in this addendum) · `NOM-IAM-08`
inter-agent message surface + signing (§1.3)

> Priority order within the tranche: the coverage-map correction costs nothing and should not
> wait on anything. Memory write governance next — it is the more complete blind spot and the
> one most likely to become a customer or auditor question given how fast agent memory
> adoption is moving. Inter-agent signing follows — same urgency in the taxonomy, larger lift
> (key management).

### Tranche 6 — declared hardening
ASI04 signature verification on MCP registration (§1.4) · ASI10 periodic re-attestation
cadence (§1.4) · explicit ASI05 non-goal statement in PRD v3 §10.3 (§1.4, also a one-line fix,
do it alongside the L2.12 correction)

### Tranche 7 — dashboard UX
§2.1 table-cell audit across the rest of the app (Approvals and Guardrails done; sweep
Findings, Traces, Compliance, Escalation for the same pattern) · §2.2 Compliance page cut,
pending confirmation · §2.4 items 1–2 next (real functional value); items 3–4 after (Overview/
Board view and Trace timeline specifically); item 5 whenever someone is already touching that
CSS. §2.3 nav density is flagged, not scheduled — it implies page consolidation, a bigger call.

### Non-goals this addendum reinforces
Sandboxing an agent's own code execution (§1.4, ASI05) remains explicitly out of scope — this
addendum's only ask there is to *say so* in writing, not to build a sandbox.

---

## Reference index

**External:** OWASP Top 10 for Agentic Applications 2026 (`genai.owasp.org`, read in full,
all 10 categories + Appendix A/C mapping matrices) · Decawork (`decawork.ai/#proof`, live
product-preview mockup) · EVO (`evo-hq.com`, `github.com/evo-hq/evo`, Apache-2.0, dashboard
source read directly)

**Internal:** [PRD v3](PRD-v3-consolidated.md) · [status.md](status.md) ·
[coverage-map.md](coverage-map.md) · [enterprise-infrastructure-analysis.md](enterprise-infrastructure-analysis.md)
(Gap 6, written independently of this addendum and confirming the same hole) ·
[appendix-b-control-catalog.md](appendix-b-control-catalog.md)
