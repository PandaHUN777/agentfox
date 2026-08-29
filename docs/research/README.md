# Research — raw inputs, not living documentation

Four documents, kept for provenance, not meant to be read as current product documentation:

- **`practitioner-evidence.md`, `practitioner-signal.md`** — analysis of the full CVs of 11 vetted senior/staff/principal AI engineers (2023–2026 work history: employers, technologies, what they built by hand). This is the strongest evidence behind [`docs/PRD.md`](../PRD.md)'s central claim ("6 of 11 independently hand-built a governance layer"), which is why it's kept rather than deleted — but it's real people's career history, not a document meant for casual browsing, and it's superseded as an *argument* by the PRD's own synthesis of it.
- **`market-reality-check.md`** — a self-critical pass written 2026-08-18 after being challenged on whether an earlier draft's competitive-differentiation claims held up. Several corrections it made are now folded into `docs/PRD.md` §1.4 ("What is genuinely differentiated — and what is not").
- **`enterprise-infrastructure-analysis.md`** — early research into why enterprise agent infrastructure breaks, independent of this product. Its findings (the L0–L7 stack reconstruction, the seven failure families) are now `docs/PRD.md` §3 and [`docs/failure-modes.md`](../failure-modes.md).

**Why these moved here (2026-08-29):** they used to sit in `docs/` alongside living documents and were linked from the main README, which made them look like current product documentation. They're not — they're the raw research that current documentation (`docs/PRD.md`, `docs/gap-analysis.md`, `docs/failure-modes.md`) already synthesizes. Keeping the raw material here preserves the evidence trail for anyone who wants to check the synthesis against its source, without it competing with the living docs for a first-time reader's attention.

**If you're looking for current product documentation, you want [`docs/PRD.md`](../PRD.md), [`docs/gap-analysis.md`](../gap-analysis.md), or [`docs/failure-modes.md`](../failure-modes.md), not this folder.**
