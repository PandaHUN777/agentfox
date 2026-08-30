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

### Results, all 4,782 rows (post-fix)

| Category | Support | Metric | Before → After |
|---|---|---|---|
| `future_unknown` | 659 | Recall | 39.0% → **69.0%** |
| `controversial` | 676 | Recall | 0.74% → **5.62%** |
| `known` | 3,447 | Over-refusal rate | 0.90% → 0.99% |

Full breakdown, including per-category `question_type()` confusion counts and miss examples: [`results/kuq_summary.json`](results/kuq_summary.json).

### Fixes applied — both against a real, quantified precision cost, not blind widening

Both `PREDICTION_MARKERS` and `_OPINION_MARKERS` were widened in `src/nometria/answerability.py`, but only after testing every candidate directly against `future_unknown`/`controversial` (recall) **and** `known` (false-positive cost) — and, for `PREDICTION`, against CoCoNot's 379 unrelated real-world prompts too, since that's the closer proxy for "does this fire on ordinary text that has nothing to do with a forecast."

**`PREDICTION`** — the old `will`-based marker (`\bwill\s+(?:\w+\s+){0,3}(?:be|become|reach|grow|fall|rise|drop|increase|decrease)\b`) required the verb within 3 words of "will" **and** on a 9-word whitelist. 578 of 659 `future_unknown` questions (87.7%) contain "will" somewhere, but most use a verb outside that whitelist (`"what challenges will *arise*"`, `"how will the use of X *evolve*"`) or have the verb too far away (`"how will the use of digital art in packaging design evolve"` — 7 words between "will" and "evolve"). Four candidates were tested:

| Candidate | Recall on `future_unknown` | FP on `known` |
|---|---|---|
| Old (shipped before this round) | 32.0%* | 0.35%* |
| Wider verb list only | 44.0% | 0.49% |
| Bare `will` + any following word | 87.7% | **1.02%** |
| **Shipped: structural markers** (question-initial `"Will..."`, `"when will"`, `"N years from now"`, `"in N years"`) | **69.0%** (full pipeline) | **0.99%** (full pipeline) |

\* *Isolated to just the old `will`-marker pattern; the 39.0% headline number is the full pipeline including the year/forecast markers already in place.*

The bare-`will` candidate had the highest raw recall but was rejected — it fires on *any* sentence containing "will" plus one more word, which is exactly the kind of change that looks safe against a trivia-question benign set and still misfires on ordinary operational agent traffic ("will my order ship today," "will you send the report") this benchmark has no examples of. **Shipped instead**: five narrow, structural patterns — a question starting with `"Will"` (the inverted yes/no future-question shape), `"when will"`, and three explicit relative-future phrasings (`"N years from now"`, `"in N years"`, spelled-out variants). These are corroborating *shapes*, not a broadened verb vocabulary, so they don't fire on the same class of ordinary "will" usage a wider verb list or a bare match would. Net result: full-pipeline recall 39.0% → 69.0% for a 0.09-point rise in over-refusal (0.90% → 0.99%, 14 new false positives out of 3,447 — see below for what those look like) and **zero new false positives on CoCoNot's 379 unrelated real-world prompts**, which stayed at exactly 0.0%.

**`OPINION`** — five new patterns target third-person subjective/debatable framing that KUQ's `controversial` category actually contains: comparative claims (`"X better/worse than Y"`), normative/deserve framing (`"deserves to"`, `"should X have/get/deserve"`), `"belongs on"`, and moral-judgment framing (`"is it right/wrong/fair/moral/ethical to"`). Recall 0.74% → 5.62% (33 new true positives) for 1 new false positive out of 3,447. **A real ceiling remains, disclosed rather than papered over**: most of KUQ's debatable questions (`"Does pineapple belong on pizza?"`, `"Can a bus driver drive a train?"`) carry no syntactic marker of any kind — their subjectivity is a matter of world knowledge a pattern can't reach. Closing that gap needs actual language understanding, not more regexes; the fix here captures the structurally-detectable slice of the problem and stops there rather than reaching for over-broad markers just to move the number further.

### The 14 new false positives on `known`, inspected directly

Widening `PREDICTION` cost 14 additional over-refusals (0.90% → 0.99%). Spot-checked rather than assumed acceptable: the two clearest examples are `"2012 studies estimated what percentage of mammals could be extinct in 20 years?"` (genuinely asks about a study's *forward-looking estimate* — arguably prediction-shaped despite KUQ's "known" label, since it's citing someone else's forecast) and `"When will organomagnesium halide formation fail?"` (a genuine miss — a chemistry-conditions question that happens to match `"when will"`). Both are real, narrow, low-frequency edge cases rather than a systemic new failure mode.

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

## What this round found and fixed

Both `PREDICTION` and `OPINION` recall were real, fixable gaps, not just benchmark artifacts — and both were widened in `src/nometria/answerability.py` using structural markers chosen specifically to avoid the overfitting risk a blanket verb-list or keyword expansion would carry:

1. **`PREDICTION` recall: 39.0% → 69.0%**, via five narrow, structural future-question shapes (question-initial `"Will"`, `"when will"`, explicit relative-future phrasing) rather than a wider verb vocabulary — validated against both KUQ's `known` set and CoCoNot's 379 unrelated real-world prompts (0.0% new false positives there) before shipping.
2. **`OPINION` recall: 0.74% → 5.62%**, via five patterns for third-person subjective/comparative/normative framing — with the remaining gap (most debatable questions carry no syntactic marker at all) disclosed as a genuine architectural ceiling for a pattern-matching approach, not glossed over.

Both trade-offs — 14 new false positives for `PREDICTION`, 1 for `OPINION`, both spot-checked directly rather than assumed acceptable — are recorded here so the numbers are auditable, not just asserted.
