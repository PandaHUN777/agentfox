# Benchmarks — index

One entry per capability area. Each links to a self-contained directory with its own fetch/run scripts, committed data, committed results, and a README that reports numbers, methodology, and — where they exist — fixes applied with before/after tables. Every number in every subdirectory comes from a script anyone can run themselves; none are asserted.

**Not every capability area has a "recall/precision" benchmark, and that's disclosed rather than hidden.** Three areas here (F2, F4, F3.8) turned out to have a real, investigated reason a standard labeled-dataset benchmark doesn't apply — a declared/registry-based mechanism with no automatic-classifier dataset to score it against, or a genuine product gap with no code yet to benchmark. Each says so directly rather than forcing a number that would misrepresent either the dataset or the product.

| Area | Directory | Status | Headline |
|---|---|---|---|
| Prompt injection detection | [`REPORT.md`](REPORT.md) | Benchmarked, 4 generalization datasets | Held-out recall 66.7% @ 100% precision (ensemble); see report for the latency-ceiling correction |
| Agent-runtime security (4 tiers vs LLM Guard) | [`agent_security/`](agent_security/README.md) | Benchmarked vs a real installed competitor | Four tiers (multi-turn, indirect injection, tool-param anomaly, excessive agency) LLM Guard structurally can't cover |
| F3 — destructive actions & blast radius | [`action_safety/`](action_safety/README.md) | Benchmarked, 4 datasets, fixed to 100% | gretelai/AgentDojo both 100% precision+recall on held-out; payload-box 36.1%→89.3% recall after 2 fix rounds |
| PII detection | [`pii/`](pii/README.md) | Benchmarked, 3 datasets, 2 fix rounds | Default-policy precision 15.2%→51.9% (worst dataset); `US_SSN` 14.4%→87.3% via a score-gate |
| F1 — answerability & abstention | [`answerability/`](answerability/README.md) | Benchmarked, 2 datasets, fixes applied | `PREDICTION` recall 39.0%→69.0%, `OPINION` 0.74%→5.62%, both via structural (not blanket) markers |
| F2 — source authority & provenance | [`source_authority/`](source_authority/README.md) | **Investigated, not benchmarkable** | Mechanism is declared/registry-based; all 3 sourced datasets (HALLMARK, CRED-1, ALCE) test a different, automatic-classifier capability the product doesn't implement |
| F4 — entitlement & disclosure control | [`entitlement/`](entitlement/README.md) | Self-constructed scenario benchmark | Purpose-limitation check: 100% recall / 0% FP across 493 real PrivacyLens vignettes — a mechanical-correctness check, not a classifier stress test; read the caveat before citing this number |
| Secrets detection | [`secrets/`](secrets/README.md) | **Investigated, blocked on access** | Both sourced datasets (CredData, SecretBench) need a human license call or an author data-agreement — neither completable same-day |
| F3.8 — composed privilege escalation | [`composed_privilege_escalation/`](composed_privilege_escalation/README.md) | **Scoped, not built** | The one sourced dataset (InjecAgent) tests a different failure mode; F3.8 needs new cross-tool data-flow tracking, which is product work, not a benchmark |

## Reading this table honestly

- **"Benchmarked" rows** score existing code against a public dataset's own independently-authored ground truth — the strongest form of evidence in this list.
- **The F4 row is a self-constructed scenario benchmark**, not a labeled-dataset score — real content, mechanically-derived scenarios. Its 100%/100% result is expected-by-construction, not a stress-test finding; see `entitlement/README.md` for exactly what it does and doesn't establish.
- **The three "investigated"/"scoped" rows are real findings, not gaps in effort.** Each required fetching and directly inspecting the candidate dataset's actual schema before concluding it didn't fit — the same discipline that caught (and then fixed) real precision problems everywhere else in this table.

See `docs/dataset-sourcing.md` for the original research this build-out worked through, and `docs/failure-modes.md` / `docs/gap-analysis.md` for how these findings map onto the product's own tracked capability status.
