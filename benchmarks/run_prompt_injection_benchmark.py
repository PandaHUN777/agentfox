"""Reproducible prompt-injection detection benchmark.

    uv run python benchmarks/run_prompt_injection_benchmark.py

Runs Nometria's real, shipping detector pipeline — the exact
`InjectionHeuristicDetector` in `src/nometria/guardrails/detectors/injection.py`,
the same code that sits in front of production traffic — against
`deepset/prompt-injections` (Hugging Face, apache-2.0, 662 labeled examples,
license/source in `data/README.md`). No network calls happen here; the dataset
was fetched once (see `fetch_dataset.py`) and is committed under `data/` so
anyone can re-run this file offline and get the same numbers.

Methodology, stated because it matters for how to read the result: the detector's
regex patterns were manually extended this session by inspecting false negatives
from `data/train.json` only. `data/test.json` was never read during that process —
it exists purely as a held-out check. So this script reports THREE numbers, and the
"held_out" one is the one to trust:

  - held_out   — scored on test.json alone. Never seen during tuning. This is the
                 honest estimate of how the detector performs on new text.
  - train      — scored on train.json alone. Inflated by tuning; reported for
                 transparency about the gap between "the set I looked at" and
                 "a new example," not as a claim of quality.
  - combined   — both splits together, for anyone who wants the raw total.

Writes one `results/prompt_injection_{split}_predictions.json` per split (every
example + verdict) and `results/prompt_injection_summary.json` (all three
aggregates, plus which detector/dataset/commit produced them).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from nometria.guardrails import DetectionContext, DetectorPipeline

DATA_DIR = Path(__file__).parent / "data"
RESULTS_DIR = Path(__file__).parent / "results"


def load_split(name: str) -> list[dict]:
    return json.loads((DATA_DIR / name).read_text())


def score(rows: list[dict], pipeline: DetectorPipeline) -> tuple[dict, list[dict]]:
    predictions = []
    tp = fp = tn = fn = 0
    started = time.perf_counter()

    for row in rows:
        text = row["text"]
        label = row["label"]  # dataset convention: 1 = injection, 0 = benign
        result = pipeline.run(text, DetectionContext(surface="input"))
        predicted = int(any(d.entity_type.startswith("INJECTION") for d in result.detections))
        predictions.append({"text": text, "label": label, "predicted": predicted})
        if predicted == 1 and label == 1:
            tp += 1
        elif predicted == 1 and label == 0:
            fp += 1
        elif predicted == 0 and label == 0:
            tn += 1
        else:
            fn += 1

    duration_ms = (time.perf_counter() - started) * 1000
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
    accuracy = (tp + tn) / len(rows) if rows else 0.0

    summary = {
        "n": len(rows),
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "accuracy": round(accuracy, 4),
        "duration_ms": round(duration_ms, 1),
        "avg_ms_per_example": round(duration_ms / len(rows), 3) if rows else 0.0,
    }
    return summary, predictions


def main() -> None:
    train_rows = load_split("train.json")
    test_rows = load_split("test.json")
    pipeline = DetectorPipeline()

    train_summary, train_predictions = score(train_rows, pipeline)
    test_summary, test_predictions = score(test_rows, pipeline)
    combined_summary, combined_predictions = score(train_rows + test_rows, pipeline)

    summary = {
        "detector": "nometria.guardrails.detectors.injection.InjectionHeuristicDetector "
        "(via DetectorPipeline)",
        "dataset": "deepset/prompt-injections",
        "dataset_url": "https://huggingface.co/datasets/deepset/prompt-injections",
        "dataset_license": "apache-2.0",
        "methodology": "patterns manually extended using train.json false negatives only; "
        "test.json held out and never inspected — 'held_out' is the number to trust",
        "held_out": test_summary,
        "train": train_summary,
        "combined": combined_summary,
    }

    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "prompt_injection_summary.json").write_text(json.dumps(summary, indent=2))
    for split_name, predictions in (
        ("held_out", test_predictions),
        ("train", train_predictions),
        ("combined", combined_predictions),
    ):
        (RESULTS_DIR / f"prompt_injection_{split_name}_predictions.json").write_text(
            json.dumps(predictions, indent=2)
        )
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
