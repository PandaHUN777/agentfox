# Prompt-injection detection: a reproducible benchmark

**Headline number: with a trained classifier alongside the regex detector, held-out
recall goes 16.7% → 41.7% (2.5×), precision stays at 100%.** Every number here, good
and modest, comes from a script anyone can run themselves.

## Why this document exists

A detection claim that only the vendor can reproduce is not evidence, it's marketing.
This benchmark exists so a skeptical reader — a security engineer, a CISO's team,
anyone deciding whether to trust this — can independently verify the number instead
of taking our word for it.

```bash
uv run python benchmarks/run_prompt_injection_benchmark.py
```

That reproduces the `heuristic` config fully offline. The classifier/similarity
configs additionally need `pip install nometria[classifiers]` and one-time model
downloads (~350MB `protectai/deberta-v3-base-prompt-injection-v2`, ~90MB
`sentence-transformers/all-MiniLM-L6-v2`, both apache-2.0); the script detects
what's available and skips configs it can't run. The dataset is committed in this
repo (`data/train.json`, `data/test.json`), fetched from a public source with a
stated license — see `data/README.md`.

## The question that started this

An earlier version of this benchmark shipped `injection.heuristic` alone and got
16.7% held-out recall — real, but nowhere near what a competent trained classifier
gets on the same kind of task (see "Where the market says it stands" below). The
honest next question wasn't "tune the regex harder," it was "why are we only
running regex when the rest of the market runs a model for this." So we added one.

## Why not a live LLM/SLM as the judge?

A live model call as the detector was considered and deliberately not built.
For a narrow binary decision like this, it loses on every axis that matters here:
latency (hundreds of ms to seconds vs. the classifier's ~22ms), cost (a paid call
per request vs. free local inference), and — if the model is a hosted API rather
than something run locally — it means sending the content being screened
somewhere external, which is the opposite of what the corpus-growth approach in
this section is for. `injection.classifier` and `injection.similarity` get the
real benefit of "model understands the concept, not just the phrasing" without
either cost.

## What's being measured

- **Detector, config `heuristic`**: `InjectionHeuristicDetector` alone — regex and
  structural signals, `src/nometria/guardrails/detectors/injection.py`. Zero extra
  dependencies, sub-millisecond, and what ships **enabled by default**.
- **Detector, config `heuristic_classifier`**: the same heuristic plus
  `injection.classifier` — `protectai/deberta-v3-base-prompt-injection-v2`, a
  DeBERTa-v3-base model trained specifically for this task (apache-2.0, ~86M
  params). This is the same *technique* — and in some deployments literally the
  same model — competitor guardrail products use. **Opt-in**, not default: a real
  CPU forward pass costs tens of milliseconds per call versus the heuristic's
  fractions of one, and that's a trade-off a deployment should choose, not inherit.
- **Detector, config `heuristic_similarity`**: the heuristic plus
  `injection.similarity` — local cosine-similarity matching against
  `guardrails/data/injection_corpus.json`, a synthetic corpus of known attack/benign
  examples, embedded with `sentence-transformers/all-MiniLM-L6-v2` (apache-2.0,
  ~22M params). Nothing is sent anywhere; embedding happens on this machine. See
  "Does semantic similarity help (yet)?" below — the honest answer, this round, is
  not much.
- **Detector, config `heuristic_classifier_similarity`**: all three together.
- **Dataset**: [`deepset/prompt-injections`](https://huggingface.co/datasets/deepset/prompt-injections)
  (Hugging Face, apache-2.0), 662 labeled examples — English and German, direct
  jailbreak/injection attempts and benign prompts, `1`/`0` labels.
- **Task**: binary classification. Does the detector's pipeline fire an
  `INJECTION.*` finding on this text, yes or no?

## Results

| Config | Split | n | Precision | Recall | F1 |
|---|---|---|---|---|---|
| `heuristic` | **held_out** | 116 | 100.0% | 16.7% | 0.286 |
| `heuristic` | train | 546 | 97.1% | 32.5% | 0.487 |
| `heuristic` | combined | 662 | 97.4% | 28.9% | 0.446 |
| `heuristic_classifier` | **held_out** | 116 | **100.0%** | **41.7%** | **0.588** |
| `heuristic_classifier` | train | 546 | 94.2% | 48.3% | 0.638 |
| `heuristic_classifier` | combined | 662 | 95.4% | 47.2% | 0.631 |
| `heuristic_similarity` | **held_out** | 116 | 100.0% | 16.7% | 0.286 |
| `heuristic_similarity` | train | 546 | 97.1% | 33.0% | 0.493 |
| `heuristic_similarity` | combined | 662 | 97.5% | 29.3% | 0.450 |
| `heuristic_classifier_similarity` | **held_out** | 116 | 100.0% | 41.7% | 0.588 |
| `heuristic_classifier_similarity` | train | 546 | 94.3% | 48.8% | 0.643 |
| `heuristic_classifier_similarity` | combined | 662 | 95.4% | 46.8% | 0.628 |

**`held_out` is the number to trust** — `injection.heuristic`'s patterns were tuned
by reading `train.json`'s false negatives (never `test.json`); `injection.classifier`
and `injection.similarity` are pretrained/precomputed, never fit to this dataset,
so neither has a tuning-leakage story, but everything's scored on the same splits
for a clean comparison.

## Before / after, on the held-out split specifically

| | Recall | Precision | False positives |
|---|---|---|---|
| Original, unmodified heuristic | 0.0% (0/60 caught) | — | 0 |
| Heuristic, patterns extended | 16.7% (10/60 caught) | 100.0% | 0 |
| **Heuristic + classifier** | **41.7% (25/60 caught)** | **100.0%** | **0** |
| Heuristic + classifier + similarity | 41.7% (25/60 caught) | 100.0% | 0 |

Zero false positives held at every step. The classifier is doing essentially all
of the work on `held_out` — recall went up because it catches attacks phrased in
ways no realistic regex library covers, not because anything got looser and hoped
precision would absorb it. Adding `injection.similarity` on top changed nothing on
this split; see below for why, and why that's still worth shipping.

## Does semantic similarity help (yet)? Honestly, not much — and here's why

The instinct behind `injection.similarity` is sound: match new attacks against a
growing corpus of known ones, entirely locally, no retraining needed to add
coverage. It's implemented and it works correctly — it doesn't produce a single
false positive anywhere in this benchmark, and it correctly stays silent on
deliberately adversarial-looking-but-benign anchors like *"I want you to act as a
customer support agent"*. But on `held_out` it added **zero** net new catches
beyond the classifier, and on `train` it added one.

Diagnosed directly rather than guessed at: even genuine attack-to-attack paraphrase
pairs in the corpus only reach **0.45–0.54 cosine similarity**, and the gap over
the nearest *benign* anchor is often thin (0.36–0.39) — not enough margin to raise
`attack_threshold` past ~0.5 without accepting real false positives (tested: at
0.45, precision on `train` alone drops to 40.5%; at 0.6, the shipped default,
recall from this detector alone is close to zero). Two compounding causes:

1. **The corpus is small.** 88 attack anchors, spanning 9 intent categories across
   4 languages, is a reasonable v1 but not enough density for nearest-neighbor
   search to reliably land close to an unseen paraphrase. This is the fixable part
   — growing `guardrails/data/injection_corpus.json` needs no retraining, just more
   examples and a re-embed, unlike the classifier.
2. **MiniLM is a general-purpose sentence embedding model**, not one fine-tuned to
   separate "this is an override attempt" from "this merely resembles one
   topically." `injection.classifier`'s DeBERTa model was fine-tuned on exactly
   this binary decision; that's a structural advantage a generic embedding model
   doesn't have, however large the corpus gets.

So the honest framing: `injection.similarity` isn't yet pulling measurable weight
on a static benchmark like this one — but a static benchmark isn't its real use
case. Its actual value is closing the loop on something a benchmark can't
represent: the moment a red-team exercise or a real incident surfaces a new
attack phrasing, adding it as one corpus entry gives every near-duplicate
rephrasing of that same attack immediate coverage, with no retraining and no
redeploy. That's a genuinely different capability from what a fixed classifier or
a fixed regex library offer, and it's why it ships — as an honest v1, not a
benchmark win.

## Two bugs the classifier's own latency exposed, and the fix

Wiring in a transformer classifier surfaced two real problems before this shipped,
not after:

1. **Cold start.** The pipeline's per-detector timeout is 40ms — calibrated for
   regex, not for loading a model into memory. The very first classifier call after
   process start paid that full cost and timed out silently, degrading to "no
   detection" with no error. Fixed with `Detector.warm()` — a hook every detector
   gets (no-op by default), overridden here to load the model at process startup
   (`gateway.app.lifespan`) instead of on the first live request. `injection.classifier`
   also declares its own `timeout_ms` (75, versus the pipeline's 40ms default) — a
   detector with real per-call cost says so explicitly rather than everyone getting
   more rope.
2. **Thread contention.** Even warm, latency was wildly unstable under the
   sustained, concurrent calls the actual detector pipeline makes — sometimes 22ms,
   sometimes over 100ms, timing out often enough to silently zero out recall on two
   of three benchmark runs before this was caught. Cause: PyTorch's CPU inference
   defaults to using every core for a single forward pass, and the pipeline already
   parallelizes *across detectors* with its own thread pool (P3-6) — every
   concurrent classifier call was spawning a multi-threaded forward pass on top of
   an already-threaded scheduler, and the two fought over the same cores. Fixed
   with `torch.set_num_threads(1)`: one thread per call, since the outer pipeline
   is where the real concurrency belongs. Stable ~22ms per call after.

Both were caught by actually running the benchmark under realistic load, not by
inspecting the code — which is the whole argument for publishing a runnable
benchmark instead of a number.

## What's still missed, honestly

Even at 41.7%, most of the held-out set's positives still slip through. They
cluster into two groups:

**Genuinely missed attacks**: flattery-then-pivot social engineering ("You've
outdone yourself! Now, one more thing..."), and a residue the classifier itself
doesn't catch — a model trained on one corpus doesn't generalize to every phrasing
either, it's just meaningfully better at it than hand-written patterns.

**Deliberately out of scope**: a large share of this dataset's positive-labeled
examples are generic role-play framing — *"I want you to act as a Linux terminal,"*
*"I want you to act as an English translator"* — with no restriction-bypass,
exfiltration, or harmful-content signal attached. `deepset/prompt-injections` labels
these as positive; matching that definition exactly would flood real deployments
with false positives on completely ordinary persona-based agents ("act as a
customer support assistant"). This is a scope boundary, not an oversight, and it's
part of why recall here will structurally stay well under 100% even as detection
keeps improving — see `results/prompt_injection_heuristic_classifier_held_out_predictions.json`
for the full list of what's still missed.

## Where the market says it stands (context, not our score)

[Lakera's PINT benchmark](https://github.com/lakeraai/pint-benchmark) is the most
widely-cited prompt-injection benchmark with named-vendor numbers, but its dataset
is not public — only Lakera can run it, and the repository is now archived. We
cannot reproduce a PINT score ourselves, so we aren't claiming one. For context
only, Lakera's own published table (`DETAILS.md` in that repo) reports: Lakera
Guard 95.2%, AWS Bedrock Guardrails 89.2%, Azure AI Prompt Shield 89.1%,
**`protectai/deberta-v3-base-prompt-injection-v2` 79.1%** — the same model this
benchmark's `heuristic_classifier` config runs — Llama Prompt Guard 2 78.8%, Google
Model Armor 70.1%. These numbers aren't directly comparable to ours (different
dataset, different methodology, self-reported by each vendor), which is exactly why
we picked a dataset we could publish raw predictions for instead — but the fact
that the deberta model sits mid-pack on PINT's leaderboard is a useful sanity check
that our `heuristic_classifier` config is running the same class of technique the
market's better products do, not a homemade substitute for one.

## Files

- `fetch_dataset.py` — how `data/*.json` was obtained (re-runnable).
- `data/README.md` — dataset source, license, schema.
- `run_prompt_injection_benchmark.py` — the scoring script, all four configs.
- `results/prompt_injection_summary.json` — every config × split aggregate.
- `results/prompt_injection_{config}_{split}_predictions.json` — every example
  scored individually, for anyone who wants to check a specific case.
- `../src/nometria/guardrails/data/injection_corpus.json` — the synthetic anchor
  corpus `injection.similarity` matches against. Growing this file (and
  re-running) is the whole improvement path for that detector — no retraining.
