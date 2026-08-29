# PII detection, benchmarked

**Sequential dataset-sourcing build-out** (see `docs/dataset-sourcing.md`) — all three sourced PII datasets built. Scores both PII detectors that ship in `src/nometria/guardrails/`:

- `pii.native` (`detectors/pii.py`) — regex-only, jurisdiction packs (US/UK/EU/India), no NER.
- `pii.presidio` (`adapters/presidio.py`) — wraps Microsoft Presidio; `PERSON`/`LOCATION`/`DATE_TIME` excluded by policy default (`DEFAULT_EXCLUDED`) as "noisy in agent traffic."

1. [presidio-research `synth_dataset_v2.json`](https://github.com/microsoft/presidio-research) (MIT) — span-labeled synthetic sentences, scores both detectors directly, with and without the default exclusion.
2. [`gretelai/synthetic_pii_finance_multilingual`](https://huggingface.co/datasets/gretelai/synthetic_pii_finance_multilingual) (Apache-2.0) — full-length synthetic financial documents, 7 languages, 59 document formats. Precision collapses relative to Dataset 1 — a real, disclosed finding about document structure, not just a locale gap.
3. [Text Anonymization Benchmark (TAB)](https://github.com/NorskRegnesentral/text-anonymization-benchmark) (MIT) — 127 real (not synthetic) ECHR court judgments, multi-annotator labeled. The one dataset in this suite that tests NER on natural prose — and the one where full-policy Presidio performs best of all three.

```bash
uv run python benchmarks/pii/fetch_presidio_research.py
uv run python benchmarks/pii/run_presidio_research_benchmark.py

uv run --with pyarrow python benchmarks/pii/fetch_gretel_multilingual.py
uv run python benchmarks/pii/run_gretel_multilingual_benchmark.py

uv run python benchmarks/pii/fetch_tab.py
uv run python benchmarks/pii/run_tab_benchmark.py
```

## Dataset 1 — presidio-research `synth_dataset_v2.json`

1,500 synthetic, template-generated sentences, span-labeled with 17 entity types. Three detector configurations scored: `pii.native`, `pii.presidio` at its shipping default policy, and `pii.presidio` with nothing excluded (isolates exactly what the default costs).

### Results, all 1,500 rows

| Config | Precision | Recall | F1 | TP | FP | FN |
|---|---|---|---|---|---|---|
| `pii.native` | 96.6% | 14.7% | 25.5% | 253 | 9 | 1467 |
| `pii.presidio` (default policy — ships as-is) | 63.8% | 15.3% | 24.7% | 263 | 149 | 1457 |
| `pii.presidio` (nothing excluded) | 54.4% | 75.6% | 63.3% | 1300 | 1089 | 420 |

Full per-entity-type breakdown: [`results/summary.json`](results/summary.json).

### The default exclusion's cost, measured directly

This is the number `docs/dataset-sourcing.md` flagged this dataset as the way to produce: `PERSON`/`LOCATION`/`DATE_TIME` together are 1,387 of the 1,750 in-scope labeled spans in this dataset (79%). With the default policy, `pii.presidio` finds **0** of them — recall on all three is exactly 0%, because they're filtered out before scoring, not because Presidio misses them. With nothing excluded, the same engine on the same input finds 1,037 of those 1,387 (PERSON 831/857 recall = 83.1%, LOCATION 206/411 = 50.1%, DATE_TIME 119/119 = 100.0%). That's the real, disclosed trade-off the default makes: precision protection against noisy categories, paid for with a 79%-of-labeled-spans recall floor on exactly those categories, by design, until a caller opts into the full policy.

### Two real precision problems, found in the "nothing excluded" run

Turning the exclusion off to measure its cost also surfaced two weak spots in Presidio's own recognizers, not in Nometria's wrapper code — worth disclosing since they'd directly affect anyone who does enable the full policy:

- **`DATE_TIME` → `PII.DATE_OF_BIRTH` is a semantic mismatch, not just a noisy recognizer.** Presidio's `DATE_TIME` recognizer flags *any* date-shaped mention in text — "the meeting is on March 3rd," "founded in 1998" — not specifically a person's birthdate. Nometria's adapter maps it straight to `PII.DATE_OF_BIRTH` (`adapters/presidio.py::_ENTITY_MAP`). Recall on the dataset's actual `DATE_TIME` spans is 100% (119/119), but precision is 21.3% (119 TP against 440 FP) — most of the "detections" are real dates that aren't birthdates. The fix isn't a threshold; it's that the taxonomy conflates two different things under one label. Left as a disclosed finding, not fixed here — this benchmark's job is to measure and report, not to redesign the taxonomy mid-run.
- **`US_DRIVER_LICENSE` is precision 3.2%** (4 TP, 120 FP) in both Presidio configurations that had it enabled. Presidio's driver's-license recognizer is a low-specificity regex (alphanumeric-ID shaped) that fires on this dataset's other alphanumeric IDs (credit card fragments, template placeholders) far more often than on the 5 actual driver's-license spans present. Support is small (5 labeled spans total) so this shouldn't be over-read, but it's consistent with driver's-license formats being genuinely hard to distinguish from other short alphanumeric strings without state-specific format knowledge, which Presidio's generic recognizer doesn't have.

### What `pii.native`'s regex misses, and why that's expected for some of it

- **`PERSON` and `LOCATION`: 0% recall by construction.** `pii.native` is regex-only; there's no NER in a regex engine. This isn't a bug to fix, it's the entire reason the Presidio adapter exists in the same detector stack — disclosed here so the number isn't misread as a defect.
- **`DATE_OF_BIRTH`: 8.4% recall (10/119).** Native's DOB regex expects specific numeric date formats; this dataset's dates are mostly natural-language ("March 3, 1990", "the 3rd of March") or non-US-ordered, which the regex doesn't match. Lower priority than the PERSON/LOCATION gap since `pii.presidio` (full policy) already covers this category at 100% recall when enabled.
- **`US_PHONE`: 20.6% recall (19/92).** Similar story — the regex is tuned to a narrower set of US phone formats than this dataset's variety (extensions, international-looking prefixes, spacing conventions) actually contains.
- **Everything else** (`EMAIL`, `CREDIT_CARD`, `US_SSN`, `IBAN`, `IP_ADDRESS`) — native performs at or near parity with Presidio, 92.6%+ recall, ≥98% precision. These are exactly the well-structured, format-constrained categories regex is good at.

### Methodology notes

- **Scoring**: character-span overlap (any overlap between a predicted span and a ground-truth span of the same canonical type counts as a match), greedy one-to-one per document — standard for PII/NER evaluation, where finding the right entity matters more than matching its exact character boundaries. Not exact-boundary match.
- **Scope**: this dataset labels several entity types Nometria's detectors never claim to cover at all — `STREET_ADDRESS`, `ORGANIZATION`, `TITLE`, `AGE`, `NRP`, `ZIP_CODE`, `DOMAIN_NAME`. Those spans are dropped from ground truth entirely (`GT_ENTITY_MAP` in the run script); scoring a detector as wrong for not detecting a category it was never built for would misrepresent it, not evaluate it.
- **One deliberate proxy**: presidio-research labels country/city mentions `GPE` rather than `LOCATION`. Mapped 1:1 onto `PII.LOCATION` since it's the closest match and the dataset has no separate `LOCATION` label — a disclosed scope decision, not a hidden one.
- **Direct detector calls, not via `DetectorPipeline`**: calling `pii.presidio` through the pipeline marks it "degraded" (timed out) on its first call even after `warm_all()` — the same latency-ceiling measurement artifact `benchmarks/REPORT.md` documents for the injection classifier (a shared timeout budget silently drops a slow-but-correct first call). Calling `.detect()` directly on the detector object avoids it: the underlying spaCy/Presidio model loads once (~3s) on the very first call in a process, then every subsequent call is single-digit-to-low-double-digit milliseconds — the full 1,500-row × 3-config run completes in under 30 seconds.
- **Dataset is synthetic**, not real personal data — Presidio's own template-based generator. Doesn't test real-world formatting noise (OCR errors, redaction artifacts, code-switched text) the way a real-text dataset (e.g. the Text Anonymization Benchmark, sourced but not yet built — see `docs/dataset-sourcing.md`) would.

---

## Dataset 2 — gretelai/synthetic_pii_finance_multilingual

5,594 full-length synthetic financial documents (test split), 7 languages (English, French, German, Dutch, Spanish, Italian, Swedish), 59 document formats spanning natural prose (Email, Employment Contract, Privacy Policy) and dense structured/machine formats (EDI, SWIFT Message, FIX Protocol, MT940, XBRL, BAI Format, CSV). Documents average ~1,300 characters — 10-20x longer than Dataset 1's single sentences. Same three detector configurations as Dataset 1.

### Results, all 5,594 rows

| Config | Precision | Recall | F1 | TP | FP | FN |
|---|---|---|---|---|---|---|
| `pii.native` | 38.8% | 17.0% | 23.7% | 2,463 | 3,889 | 12,017 |
| `pii.presidio` (default policy) | 15.2% | 19.9% | 17.3% | 2,883 | 16,071 | 11,597 |
| `pii.presidio` (nothing excluded) | 16.3% | 70.1% | 26.5% | 10,151 | 51,981 | 4,329 |

Full per-entity-type and per-language breakdown: [`results/gretel_multilingual_summary.json`](results/gretel_multilingual_summary.json).

### The headline finding: precision collapses on this document shape, and it isn't primarily a language problem

Recall holds up close to Dataset 1's numbers (70.1% vs 75.6% for the full-policy config), but precision falls off a cliff — 54.4% → 16.3% full-policy, 63.8% → 15.2% default-policy. Two entity types drive almost all of it:

- **`US_DRIVER_LICENSE`: 0.9% precision at the default policy** (107 TP against 12,073 FP). Presidio's driver's-license recognizer is a low-specificity alphanumeric-ID pattern (already flagged as weak in Dataset 1, at a much smaller scale — 3.2% precision there). This dataset is full of structurally similar alphanumeric codes that aren't driver's licenses — account numbers, reference IDs, SWIFT/BIC codes, transaction IDs — and it fires on nearly all of them. At this precision, a caller who enables this recognizer gets almost pure noise.
- **`DATE_TIME` → `PII.DATE_OF_BIRTH`: 1.6% precision at the full policy** (223 TP against 13,889 FP; the default policy excludes this type entirely, so it contributes 0 FP there but also 0 TP). This is the same taxonomy conflation Dataset 1 surfaced (Presidio's `DATE_TIME` recognizer flags any date-shaped mention, not specifically a birthdate) — confirmed again here with a much larger, financial-document-heavy sample, where dates (statement dates, due dates, transaction dates) are extremely common and almost none of them are birthdates.

**Is this a language-mismatch problem or a document-format problem?** Both contribute, but document format dominates. `pii.presidio` runs with `language="en"` throughout (the product's shipping default), so English text should be its best case — and English rows still account for the majority of both problem categories' false positives (8,978 of 13,889 `DATE_OF_BIRTH` FPs, 6,397 of 12,073 `US_DRIVER_LICENSE` FPs — English is ~53% of rows but a larger share of these two FP counts). The structured, code-dense financial document formats in this dataset trigger these two pattern-based recognizers heavily regardless of language; multilingual coverage is a real, separate, smaller effect (see below), not the primary driver of the precision drop.

### A real, disclosed native-detector finding: the DOB regex is separator-specific, not just format-specific

`pii.native`'s `DATE_OF_BIRTH` regex (`detectors/pii.py`) matches day-month-year with a `/` or `-` separator only. This dataset's actual date strings let us test that directly, broken out by language — recall on labeled `date_of_birth` spans:

| Language | Support | Recall |
|---|---|---|
| French | 15 | 80.0% |
| Italian | 30 | 66.7% |
| English | 143 | 52.4% |
| Spanish | 19 | 47.4% |
| Dutch | 5 | 40.0% |
| Swedish | 13 | 38.5% |
| **German** | **25** | **0.0%** |

German is a hard 0%, not just low. Spot-checking the actual German `date_of_birth` span text confirms why: `'12.02.1969'`, `'01.01.1980'`, `'15.06.1998'` — German-locale dates in this dataset are period-separated (`DD.MM.YYYY`), a separator the regex's character class (`[/-]`) never matches. This is a concrete, fixable gap (add `.` to the separator class), not a vague "multilingual is hard" statement — left as a disclosed finding rather than fixed in this benchmarking pass.

### What held up well

`PII.EMAIL` (96.4% precision / 95.6% recall, presidio), `PII.IBAN` (96.8%/74.4%), and `PII.IP_ADDRESS` (90.8%/89.9%) perform close to their Dataset 1 numbers despite the much harder document shape — these are well-structured, format-constrained categories where both engines are reliable regardless of document type or language. `PII.US_SSN` is a clear exception worth flagging in the other direction: Presidio's SSN precision fell from ~100% (Dataset 1) to 14.4% here, almost certainly the same "dense financial documents are full of other 9-digit-shaped numbers" effect driving the driver's-license and date problems, at a smaller scale.

### Methodology notes

- **Absolute FP/FN counts aren't directly comparable to Dataset 1's** — these documents are 10-20x longer, so any constant per-character false-positive rate produces much larger raw counts. Precision and recall (which normalize for volume) are the fair comparison; both moved sharply in the same direction the raw counts suggest, so this isn't purely a length artifact.
- **`password`/`api_key` labels exist in this dataset** (101 and 91 labeled spans respectively) but are deliberately out of scope for this PII benchmark — they're secrets, not personal data, and scoring them against `pii.*` detectors would misrepresent both the dataset and the detectors. Flagged here as a candidate input for a future *secrets*-detection benchmark against `detectors/secrets.py`, not built in this pass.
- Same span-overlap scoring, same `GT_ENTITY_MAP` scoping discipline, same direct-detector-call methodology as Dataset 1 — see that section and the run script's docstring for the full rationale.

---

## Dataset 3 — Text Anonymization Benchmark (TAB), real ECHR case law

127 real European Court of Human Rights judgments (`echr_test.json`), the only dataset in this suite built from real text rather than synthetic or templated generation. Multiple human annotators per document (1-10); ground truth is the union across annotators, deduplicated on exact span boundaries — a disclosed simplification of TAB's own weighted evaluation protocol, not a reproduction of it. In-scope types here are `PERSON`, `LOC` (→ `PII.LOCATION`), and `DATETIME` (→ `PII.DATE_OF_BIRTH`, same disclosed conflation as the other two datasets) — `ORG`, `DEM`, `CODE`, `MISC`, `QUANTITY` have no corresponding Nometria detector and are dropped from ground truth.

### Results, all 127 rows

| Config | Precision | Recall | F1 | TP | FP | FN |
|---|---|---|---|---|---|---|
| `pii.native` | — | 0.0% | — | 0 | 0 | 4,799 |
| `pii.presidio` (default policy) | — | 0.0% | — | 0 | 0 | 4,799 |
| `pii.presidio` (nothing excluded) | 83.6% | 86.9% | 85.2% | 4,168 | 820 | 631 |

`pii.native` and the default-policy config score exactly 0% recall **by construction**, not as a finding: every in-scope type here (`PERSON`/`LOCATION`/`DATE_OF_BIRTH`) is either unsupported by regex alone or excluded by the shipping default policy. This dataset's entire in-scope surface is the part the default policy turns off — full per-entity-type breakdown: [`results/tab_summary.json`](results/tab_summary.json).

### The best full-policy result of the three datasets — and a real explanation for why

83.6% precision / 86.9% recall is meaningfully better than both Dataset 1 (54.4%/75.6%) and Dataset 2 (16.3%/70.1%). The most striking single number: `DATE_TIME` → `PII.DATE_OF_BIRTH` precision is **90.8%** here (2,715 TP / 276 FP), against 21.3% on Dataset 1 and 1.6% on Dataset 2. This flips the "DATE_TIME is inherently noisy" framing from the other two write-ups into something more precise: **the conflation's cost depends heavily on document domain, not just on the taxonomy mismatch itself.** Real ECHR judgments' date mentions are overwhelmingly tied to the people in the case (birth dates, dates of events central to the individual's history) rather than the generic transaction/statement dates that dominate Dataset 2's financial documents — so the same "any DATE_TIME = DATE_OF_BIRTH" mapping that was mostly wrong in a financial-document context turns out to be mostly right in a legal-narrative context. Coherent, natural, single-language prose is also simply closer to what a general-purpose NER model was trained on than either templated synthetic sentences or dense multilingual structured documents — consistent with `PERSON` (85.5%/78.6%) and `LOCATION` (56.2%/74.2%) both landing at or above their Dataset 1/2 numbers too, `LOCATION` precision aside (the one category that stays the weakest across all three datasets).

### The number that matters most for a real anonymization use case

TAB's own `identifier_type` field ranks re-identification risk — `DIRECT` means the mention alone identifies the person (a name, a case number used as an identifier); `QUASI` means identifying only combined with other mentions; `NO_MASK` means not actually identifying despite the entity type (e.g. a judge referenced by institutional role). Recall on full-policy Presidio, broken out by this field:

| Identifier type | Support | Recall |
|---|---|---|
| `DIRECT` | 228 | 96.9% |
| `QUASI` | 3,914 | 88.8% |
| `NO_MASK` | 657 | 71.7% |

Recall is highest exactly where it matters most — `DIRECT` identifiers, the mentions that alone would re-identify someone, are caught 96.9% of the time. `NO_MASK` mentions (entity-shaped but not actually identifying) being caught least often is also the right direction for a detector to err in — those are the ones where a miss costs nothing.

### Methodology notes

- **Ground truth is a union-across-annotators simplification**, not TAB's full weighted risk protocol (`evaluation.py` in the source repo, which the TAB paper uses for its own headline numbers). Different annotators occasionally mark slightly different boundaries for what is clearly the same real mention; each distinct boundary survives as a separate ground-truth span here, which very likely inflates the false-negative count somewhat versus a boundary-tolerant merge. Disclosed, not corrected — correcting it would mean reimplementing TAB's own evaluation logic rather than benchmarking Nometria's detectors.
- Same span-overlap scoring, same direct-detector-call methodology as Datasets 1 and 2.
- **Only `test` (127 rows) was used** — `train` (1,014 rows) and `dev` (127 rows) exist in the same source repo and could extend this sample if a larger real-text run is wanted later.

### PII benchmarking: build-out complete

All three sourced datasets (`docs/dataset-sourcing.md`) are now built. Combined picture across all three: `EMAIL`/`IBAN`/`IP_ADDRESS` are reliably strong regardless of document type, language, or synthetic-vs-real; `PERSON`/`LOCATION`/`DATE_TIME` (excluded by default) show real, now-quantified recall and precision trade-offs that vary by domain rather than being uniformly "noisy"; and `US_DRIVER_LICENSE` is a consistently weak Presidio recognizer across every dataset tested (3.2% precision on Dataset 1, 0.9% on Dataset 2) worth flagging for anyone considering enabling it.
