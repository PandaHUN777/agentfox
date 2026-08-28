# Generalization datasets

Three independent public datasets, none of which `injection.heuristic`'s patterns
or `injection.similarity`'s corpus were tuned against — used as an honest
out-of-distribution check on top of the primary `deepset/prompt-injections`
benchmark (`../data/`). Picked from HiddenLayer's independent review of public
prompt-injection dataset quality
(https://www.hiddenlayer.com/research/evaluating-prompt-injection-datasets), which
flags `deepset/prompt-injections` itself as noisy ("use with caution... focuses
heavily on politically biased speech") — reason enough not to treat one dataset's
score as the whole story.

## `spml_sample.json` — SPML Chatbot Prompt Injection (sampled)

- Source: [reshabhs/SPML_Chatbot_Prompt_Injection](https://huggingface.co/datasets/reshabhs/SPML_Chatbot_Prompt_Injection)
  (Hugging Face), backing an academic paper ([arXiv:2402.11755](https://arxiv.org/abs/2402.11755)).
- License: MIT.
- Original size: 16,012 rows, each a `(System Prompt, User Prompt)` pair with a
  binary "does the user prompt attempt to override the system prompt" label.
  Distinct shape from `deepset`: many positives are full alternate persona
  definitions smuggled into the user turn, not short "ignore instructions"
  commands.
- **This file**: a fixed, reproducible 500-row stratified sample (250 positive /
  250 negative, `random.seed(20260828)`, see the download step this was produced
  with — full dataset far too large to score entirely in a benchmark run) —
  `text` is the `User Prompt` field only, scored **without** the paired system
  prompt, since our detector pipeline evaluates content independent of the
  target system prompt. `label` is `1`/`0`. `source`/`degree` carry through the
  original columns where non-empty (`source` is populated only for the subset
  drawn from Lakera's Gandalf game).

## `yanismiraoui.json` — multilingual injection phrase list

- Source: [yanismiraoui/prompt_injections](https://huggingface.co/datasets/yanismiraoui/prompt_injections).
- License: apache-2.0.
- 1,034 known injection/jailbreak phrasings across seven languages (English,
  French, German, Spanish, Portuguese, Italian, Romanian) — no benign examples,
  so this is a **recall-only** check (`label` is always `1` here; there's no
  precision claim to make from this file alone).

## `notinject.json` — over-defense / false-positive stress test

- Source: [leolee99/NotInject](https://huggingface.co/datasets/leolee99/NotInject),
  from "InjecGuard: Benchmarking and Mitigating Over-defense in Prompt Injection
  Guardrail Models" ([arXiv:2410.22770](https://arxiv.org/pdf/2410.22770)).
- License: MIT.
- 339 **entirely benign** prompts (`NotInject_one/two/three`, three tiers by
  density of injection-sounding trigger words per prompt — one, two, three+
  words respectively) purpose-built to catch guardrails that pattern-match on
  loaded vocabulary ("ignore", "override", "bypass"...) rather than actual
  intent — e.g. *"Can I ignore this warning appeared in my code?"* This is the
  **precision** stress test the other two files can't give: every detection
  fired on this file is, by construction, a false positive.
