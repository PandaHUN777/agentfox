# F1 — answerability & abstention, benchmarked

**First answerability datasets built** (see `docs/dataset-sourcing.md`). Scores `src/nometria/answerability.py` — a **declared-boundary** system, not a generic unanswerable-question classifier: `classify_answerability(text, boundary)` only refuses a question type the operator hasn't declared answerable. Both benchmarks here use exactly the boundary the system defaults to out of the box (`declare_boundary()`'s own fallback when `answerable_types` isn't specified: `["fact", "aggregate", "procedure"]`, no coverage window, no topic/entity restriction) — not a boundary tuned to make either benchmark look better.

1. [KUQ (Known-Unknown Questions)](https://huggingface.co/datasets/amayuelas/KUQ) (MIT) — 4,782 rows across `future_unknown`, `controversial`, and `known` categories. Recall test for the PREDICTION/OPINION classifiers and the over-refusal control.
2. [CoCoNot](https://huggingface.co/datasets/allenai/coconot) `contrast` split (MIT) — 379 rows, real-world-shaped prompts about safety/completeness/modality that have nothing to do with knowledge boundaries. Pure over-refusal/robustness control.

```bash
uv run python benchmarks/answerability/fetch_kuq.py
uv run python benchmarks/answerability/run_kuq_benchmark.py

uv run --with pyarrow python benchmarks/answerability/fetch_coconot.py
uv run python benchmarks/answerability/run_coconot_benchmark.py
```

## Dataset 1 — KUQ (Known-Unknown Questions)

4,782 rows kept from `knowns_unknowns.jsonl`'s 6,884 (the smaller, Turk-curated file — `unknowns_all.jsonl`, a larger GPT-augmented expansion in the same repo, wasn't used but is noted as available for a bigger future run). Three categories in scope:

- `future_unknown` (659 rows) — future-tense questions. Expected: `question_type()` classifies as `prediction`.
- `controversial` (676 rows) — debatable/subjective questions. Expected: classifies as `opinion`.
- `known` (3,447 rows) — ordinary, answerable factual questions. The over-refusal control.

Dropped as out of scope: `ambiguous`, `counterfactual`, `false assumption`, `unsolved problem` (437+520+577+568 = 2,102 rows) — none of these are about whether *the system* holds the answer, which is the only thing `answerability.py`'s declared-boundary design claims to check; they're about the question's own epistemic shape (false premises, unanswerable-in-principle), a different capability this system doesn't model.

### Results, all 4,782 rows

| Category | Support | Metric | Value |
|---|---|---|---|
| `future_unknown` | 659 | Recall | **39.0%** |
| `controversial` | 676 | Recall | **0.74%** |
| `known` | 3,447 | Over-refusal rate | **0.90%** |

Full breakdown, including per-category `question_type()` confusion counts and miss examples: [`results/kuq_summary.json`](results/kuq_summary.json).

### `controversial`'s 0.74% recall is a scope mismatch, not simply a broken detector

Reading the actual misses shows why: KUQ's `controversial` category means "a debatable/subjective topic with no single correct answer" — `"Are Moms better than Dads?"`, `"Does pineapple belong on pizza?"`, `"Can a man legally marry two women?"`. All third-person, factual-sounding phrasing. `answerability.py`'s `OPINION` type means something narrower and more pragmatic: the user is directly *soliciting the model's opinion* — its markers are phrases like `"do you think"`, `"in your opinion"`, `"should i"`, `"would you recommend"`. None of KUQ's `controversial` questions are phrased that way; they ask about a debatable topic in the third person rather than asking the model what it thinks. Catching "is this topic inherently subjective" from its content alone would require actual language understanding, not phrase-pattern matching — a fundamentally different (and much harder) capability than what `OPINION` currently claims to detect. Disclosed as a real scope gap, not fixed here — fixing it would mean redefining what `OPINION` means, a product decision bigger than a benchmark can make unilaterally.

### `future_unknown`'s 39.0% recall has a real, narrow cause — and a real, non-obvious fix trade-off

The `PREDICTION` regex's `will`-based marker (`\bwill\s+(?:\w+\s+){0,3}(?:be|become|reach|grow|fall|rise|drop|increase|decrease)\b`) requires the verb within 3 words of "will" **and** on a short whitelist. 578 of the 659 `future_unknown` questions (87.7%) contain "will" somewhere, but most use a verb outside that whitelist — `"what challenges will *arise*"`, `"how will the use of X *evolve*"`, `"what will *emerge*"` — or have the verb further than 3 words away in a long, complex question (`"how will the use of digital art in packaging design evolve in the future"` — 7 words between "will" and "evolve").

Tested three candidate widenings directly against this dataset before deciding what to recommend:

| Candidate | Recall on `future_unknown` | FP rate on `known` |
|---|---|---|
| Current (shipped) | 32.0%* | 0.35%* |
| Wider word-gap only (12 words, same verb list) | 36.4% | 0.41% |
| Wider verb list (+evolve/emerge/arise/impact/affect/happen/occur/change/transform/unfold) | 44.0% | 0.49% |
| Bare `will` + any following word | **87.7%** | **1.02%** |

\* *Isolated to just the `will`-marker pattern, not the full combined-marker pipeline (which also includes the year/forecast/relative-date markers) — that's why this differs from the 39.0% headline number, which is the full pipeline's result.*

The bare-`will` candidate is the most compelling on this data — 2.7x the recall for well under 1 additional point of false positives. **Not applied, deliberately**: the `known` set here is trivia-style Q&A, not representative of real enterprise agent traffic, where "will" appears constantly in ordinary *operational* questions this benchmark has no examples of — "will my order ship today," "will you send the report," "will the meeting start on time." A widening validated only against trivia questions could look safe here and still misfire heavily on exactly the traffic a real deployment would see. Recorded as a disclosed, quantified trade-off for a human product decision, not auto-applied the way the PII benchmark's narrower, lower-risk fixes were.

### The over-refusal control passed cleanly

0.90% over-refusal (31 of 3,447 `known` questions incorrectly refused) is a strong number — the deterministic classifiers stay quiet on the overwhelming majority of ordinary factual questions, which is exactly the design goal (`answerability.py`'s own docstring: over-refusal, not under-refusal, is the failure that kills adoption).

### Methodology notes

- **Both `classify_answerability()`'s `answerable` boolean and the raw `question_type()` output are scored** — for this boundary (no coverage/topic/entity restriction, no `known_entities` supplied), they're the same decision by construction, so agreement is exact; both are reported so the per-category `question_type()` breakdown is visible directly.
- **No database session used** — `KnowledgeBoundary` is instantiated directly as a plain Python object (never persisted), since `classify_answerability()` only reads its attributes and never queries the database itself.
- Ground truth here is the dataset's own category labels, not derived from a parser or regex — no circularity risk.

---

## Dataset 2 — CoCoNot `contrast` split

379 real-world-shaped prompts CoCoNot's own authors designed as should-comply counterparts to its main refusal-worthy set — a prompt that superficially resembles something a well-behaved assistant might decline, but shouldn't. None are about knowledge boundaries (CoCoNot's categories — safety concerns, incomplete requests, unsupported/modality-limited requests — are a different capability, governed elsewhere in Nometria or not modeled at all), which is exactly what makes this a clean negative control: any `answerable=False` verdict here is unambiguously the deterministic classifiers misfiring on ordinary text, not a scope disagreement the way KUQ's `controversial` category is.

### Results, all 379 rows

**Over-refusal rate: 0.0% (0/379).**

| Category | Support | FP |
|---|---|---|
| Requests with safety concerns | 149 | 0 |
| Incomplete requests | 148 | 0 |
| Unsupported requests | 82 | 0 |

Full breakdown: [`results/coconot_summary.json`](results/coconot_summary.json).

A clean pass — the `PREDICTION`/`OPINION`/`AGGREGATE`/`PROCEDURE` regexes never fire on any of these 379 prompts, despite them spanning dangerous-topic phrasing, false presuppositions, underspecified requests, and modality-limited requests (`"draw me a picture of..."`-style asks a text-only boundary check has every opportunity to misfire on and doesn't).

### Methodology notes

- Same boundary, same direct-call methodology as Dataset 1.
- All 379 rows are, by construction, "should comply" — this is a pure false-positive measurement, not a precision/recall pair; there's no positive class to measure recall against in this split.

---

## What this round found

Two real findings, both disclosed rather than silently fixed:

1. **`OPINION` detection has a genuine scope gap** against subjective/debatable third-person questions (0.74% recall on KUQ's `controversial` category) — the detector's phrase-pattern approach targets direct opinion-solicitation ("do you think"), a narrower and different thing than "is this topic inherently subjective," which KUQ actually tests.
2. **`PREDICTION` detection's `will`-marker has real, quantified recall headroom** (39.0% → up to 87.7% with a broader match) **but the safe fix isn't obvious** from this data alone — the benign control set doesn't represent the operational "will" questions a real deployment would see, so widening the marker without that traffic to validate against risks trading a measured gain here for an unmeasured loss in production.

Both are exactly the kind of finding this benchmark suite exists to produce — not every gap found should be closed by whoever happens to be running the benchmark that found it.
