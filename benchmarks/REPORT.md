# Prompt-injection detection: a reproducible benchmark

**Headline number: 100% precision, 16.7% recall, on a held-out public dataset the
detector's patterns were never tuned against.** Both numbers, the good one and the
modest one, come from the same script anyone can run themselves.

## Why this document exists

A detection claim that only the vendor can reproduce is not evidence, it's marketing.
This benchmark exists so a skeptical reader — a security engineer, a CISO's team,
anyone deciding whether to trust this — can independently verify the number instead
of taking our word for it.

```bash
uv run python benchmarks/run_prompt_injection_benchmark.py
```

That's the entire reproduction step. No account, no API key, no vendor cooperation
needed. The dataset is committed in this repo (`data/train.json`, `data/test.json`),
fetched from a public source with a stated license — see `data/README.md`.

## What's being measured

- **Detector**: `InjectionHeuristicDetector`, the exact code in
  `src/nometria/guardrails/detectors/injection.py` that runs in front of production
  traffic — not a special evaluation build.
- **Dataset**: [`deepset/prompt-injections`](https://huggingface.co/datasets/deepset/prompt-injections)
  (Hugging Face, apache-2.0), 662 labeled examples — English and German, direct
  jailbreak/injection attempts and benign prompts, `1`/`0` labels.
- **Task**: binary classification. Does the detector's pipeline fire an
  `INJECTION.*` finding on this text, yes or no?

## Methodology — and the mistake we didn't ship

The first version of this benchmark ran the *unmodified* detector against this
dataset and got **5.3% recall on the full set, 0% on what turned out to be the
held-out split** — the detector caught almost nothing outside the small
hand-written test corpus it had been validated against internally (`tests/corpus/
injection.py`, still 100% recall on its own 25 examples — that number is real, it's
just measuring a much narrower thing than "prompt injection in general").

That result didn't get published. Instead:

1. `data/train.json`'s false negatives were inspected and used to manually extend
   the detector's regex patterns — broader phrasing for instruction-override
   ("forget", "ignore", "drop" + a wider set of objects than the textbook
   "instructions"), system-prompt-leak phrasing with words inserted between verb
   and object, and equivalent German phrasings, since roughly half the dataset is
   German.
2. `data/test.json` was never read during that process. It's scored exactly once,
   at the end, as the honest check.
3. A performance regression the new patterns introduced (normalization time on a
   large document went from ~15ms to ~40ms, over the enforcement budget) was caught
   by the existing test suite and fixed by deduplicating an overlapping pattern
   before anything shipped.

This is why the script reports three numbers instead of one:

| Split | n | Precision | Recall | F1 |
|---|---|---|---|---|
| **`held_out`** (test.json, never tuned against) | 116 | **100.0%** | **16.7%** | 0.286 |
| `train` (train.json, informed the patterns) | 546 | 97.1% | 32.5% | 0.487 |
| `combined` (both) | 662 | 97.4% | 28.9% | 0.446 |

**`held_out` is the number to trust.** `train` is reported for transparency about
the gap between "the examples I looked at" and "a new one," not as a quality claim —
publishing only the inflated number would be exactly the kind of self-graded result
this document exists to avoid.

## Before / after, on the same held-out split

| | Recall | Precision | False positives |
|---|---|---|---|
| Before this pass | 0.0% (0/60 caught) | — | 0 |
| After this pass | 16.7% (10/60 caught) | 100.0% | 0 |

Zero false positives held in both states — the improvement came from catching more
real attacks, not from getting looser and hoping precision would absorb it.

## What's still missed, honestly

The 50 held-out false negatives cluster into two groups:

**Genuinely missed attacks** (in scope, not yet caught): flattery-then-pivot social
engineering ("You've outdone yourself! Now, one more thing..."), some novel
persona-reset phrasings, a handful of non-English constructions outside the
English/German patterns added this pass.

**Deliberately out of scope**: a large share of this dataset's positive-labeled
examples are generic role-play framing — *"I want you to act as a Linux terminal,"*
*"I want you to act as an English translator"* — with no restriction-bypass,
exfiltration, or harmful-content signal attached. `deepset/prompt-injections` labels
these as positive; Nometria's detector deliberately doesn't flag bare persona
assignment, because a huge share of legitimate production agents *are*
persona-based ("act as a customer support assistant"), and matching this dataset's
definition exactly would mean flooding real deployments with false positives on
completely ordinary agent framing. This is a scope boundary, not an oversight — but
it's also why `held_out` recall on this specific dataset will structurally stay
below 100% even as detection genuinely improves, and why we're saying so here
instead of silently picking a friendlier dataset.

## Where the market says it stands (context, not our score)

[Lakera's PINT benchmark](https://github.com/lakeraai/pint-benchmark) is the most
widely-cited prompt-injection benchmark with named-vendor numbers, but its dataset
is not public — only Lakera can run it, and the repository is now archived. We
cannot reproduce a PINT score ourselves, so we aren't claiming one. For context
only, Lakera's own published table (`DETAILS.md` in that repo) reports: Lakera
Guard 95.2%, AWS Bedrock Guardrails 89.2%, Azure AI Prompt Shield 89.1%,
protectai/deberta-v3-base-prompt-injection-v2 79.1%, Llama Prompt Guard 2 78.8%,
Google Model Armor 70.1%. These numbers aren't directly comparable to ours — different
dataset, different methodology, self-reported by each vendor — which is exactly why
we picked a dataset we could publish raw predictions for instead.

## Files

- `fetch_dataset.py` — how `data/*.json` was obtained (re-runnable).
- `data/README.md` — dataset source, license, schema.
- `run_prompt_injection_benchmark.py` — the scoring script.
- `results/prompt_injection_summary.json` — the three-way aggregate.
- `results/prompt_injection_{held_out,train,combined}_predictions.json` — every
  example scored, individually, for anyone who wants to check a specific case.
