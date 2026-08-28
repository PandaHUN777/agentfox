"""Safety-classifier adapters (P3-5).

Two tiers, and the split is a **licence** decision, not a quality one:

* :class:`GraniteGuardianDetector` — IBM Granite Guardian, **Apache-2.0 weights**.
  The default. Appendix A.1 calls this the cleanest licence in the classifier group,
  which is what a commercial product needs.
* :class:`RestrictedClassifierDetector` — Meta Llama Guard / Prompt Guard and Google
  ShieldGemma. Capable, but the Llama Community and Gemma licences are **not
  OSI-approved**: they add acceptable-use policies and (for Llama) a >700M-MAU
  clause. Appendix A.4 requires these to be opt-in, so the adapter refuses to load
  unless ``NOMETRIA_ACCEPT_RESTRICTED_MODEL_LICENSES=1``.

Neither is installed by default. A customer must not inherit a licence obligation
by running ``docker compose up``.
"""

from __future__ import annotations

import functools

from ...config import get_settings
from ..base import BaseDetector, Detection, DetectionContext, redact_sample


class _TransformersClassifier(BaseDetector):
    model_id: str = ""
    label_map: dict[str, str] = {}
    restricted: bool = False
    #: A model shipping custom modeling code (not a stock transformers architecture)
    #: needs this to load at all. Left False by default — executing a model repo's
    #: Python is a real trust boundary, so a subclass opts in explicitly rather than
    #: this being silently on for everyone. Only ever set for a specific, named,
    #: reputable model_id (see PromptInjectionClassifierDetector).
    trust_remote_code: bool = False

    def available(self) -> bool:
        if self.restricted and not get_settings().restricted_models_allowed:
            return False
        try:
            import transformers  # noqa: F401
        except Exception:
            return False
        return self._weights_present()

    def _weights_present(self) -> bool:  # pragma: no cover - requires optional dep
        try:
            from huggingface_hub import try_to_load_from_cache

            return try_to_load_from_cache(self.model_id, "config.json") is not None
        except Exception:
            # NFR-4/NFR-9: never trigger a download at request time. Absent weights
            # mean "unavailable", not "fetch it now".
            return False

    @functools.cached_property
    def _pipeline(self):  # pragma: no cover - requires optional dependency
        import torch
        from transformers import pipeline

        # PyTorch's default intra-op thread pool sizes itself to the machine's core
        # count, which is right for one big batched job and wrong here: the
        # detector pipeline already parallelises across *detectors* with its own
        # ThreadPoolExecutor (P3-6), so every concurrent classifier call spawns
        # its own multi-threaded forward pass on top of that. The two thread pools
        # fight over the same cores — measured effect was ~22ms per call in
        # isolation ballooning past the 75ms timeout under concurrent/sustained
        # load. One torch thread per call is the standard fix for many-small-calls
        # serving, as opposed to few-large-batches.
        torch.set_num_threads(1)
        return pipeline(
            "text-classification",
            model=self.model_id,
            top_k=None,
            trust_remote_code=self.trust_remote_code,
        )

    def warm(self) -> None:  # pragma: no cover - requires optional dependency
        if self.available():
            self._pipeline("")

    def _detect(self, content: str, context: DetectionContext) -> list[Detection]:
        if not content:
            return []
        scores = self._pipeline(content[:4000])
        rows = scores[0] if scores and isinstance(scores[0], list) else scores
        out: list[Detection] = []
        for row in rows or []:
            label = str(row.get("label", ""))
            score = float(row.get("score", 0.0))
            entity = self.label_map.get(label.lower())
            if not entity or score < 0.5:
                continue
            out.append(
                Detection(
                    entity_type=entity,
                    score=score,
                    end=len(content),
                    sample=redact_sample(content, keep=12),
                    owasp_id="LLM09",
                    detail={"engine": self.key, "model": self.model_id, "label": label},
                )
            )
        return out


class PromptInjectionClassifierDetector(_TransformersClassifier):
    """A model trained specifically on prompt injection, not a general safety
    classifier pressed into service for it — the same technique (and, in some
    deployments, literally the same underlying model) most competitor guardrail
    products use for this exact task, rather than `injection.heuristic`'s
    hand-written patterns.

    Uses `leolee99/PIGuard` (MIT), the over-defense-mitigated successor proposed
    in "InjecGuard: Benchmarking and Mitigating Over-defense in Prompt Injection
    Guardrail Models" (arXiv:2410.22770), swapped in after this project's own
    benchmarking (see `benchmarks/REPORT.md`) showed it beating the previous
    default (`protectai/deberta-v3-base-prompt-injection-v2`) on both axes at
    once: held-out recall on `deepset/prompt-injections` at 100% precision
    (31.7% -> 66.7%), and — more importantly — the true false-positive rate on
    `leolee99/NotInject` (339 benign prompts stuffed with injection-sounding
    vocabulary, purpose-built to catch keyword-reactive guardrails) dropping
    from 42.2% to 11.5%. Ships custom modeling code, so this is the one
    detector with `trust_remote_code = True`.
    """

    key = "injection.classifier"
    version = "1.0"
    surfaces = ("input", "retrieved", "tool_result", "output", "memory_write", "agent_message")
    label_map = {
        "injection": "INJECTION.JAILBREAK",
    }
    # A real forward pass on CPU, not a regex scan — 40ms (the pipeline default,
    # calibrated for heuristics) isn't enough headroom even once the model is warm.
    # Measured directly: solo warm latency is ~23ms, but p90 climbs to ~57ms and
    # observed max to ~85ms once `injection.similarity` runs alongside it in the
    # same request (GIL/CPU time-sharing between two concurrent torch forward
    # passes, not pool exhaustion — see REPORT.md's timeout-masking finding,
    # discovered because the previous 75ms ceiling was silently dropping a real
    # fraction of classifier detections as false "no detection" results).
    timeout_ms = 150
    # PIGuard ships its own `modeling_piguard.py` in the model repo rather than
    # using a stock transformers architecture — trusted because it's the specific,
    # named, reputable model this class exists to wrap, not a general default.
    trust_remote_code = True

    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or get_settings().prompt_injection_classifier_model


class GraniteGuardianDetector(_TransformersClassifier):
    """IBM Granite Guardian — Apache-2.0. The default classifier."""

    key = "safety.granite"
    version = "1.0"
    surfaces = ("input", "output", "retrieved", "tool_result")
    label_map = {
        "yes": "SAFETY.HARM",
        "harmful": "SAFETY.HARM",
        "risky": "SAFETY.HARM",
        "jailbreak": "INJECTION.JAILBREAK",
        "unsafe": "SAFETY.HARM",
    }

    def __init__(self, model_id: str | None = None) -> None:
        self.model_id = model_id or get_settings().granite_guardian_model


class RestrictedClassifierDetector(_TransformersClassifier):
    """Llama Guard / Prompt Guard / ShieldGemma. Opt-in, licence-gated."""

    key = "safety.restricted"
    version = "1.0"
    restricted = True
    surfaces = ("input", "output", "retrieved", "tool_result")
    label_map = {
        "unsafe": "SAFETY.HARM",
        "jailbreak": "INJECTION.JAILBREAK",
        "injection": "INJECTION.INSTRUCTION_OVERRIDE",
        "s1": "SAFETY.HARM",
        "s2": "SAFETY.HARM",
    }

    def __init__(self, model_id: str = "meta-llama/Llama-Guard-3-8B") -> None:
        self.model_id = model_id

    def license_notice(self) -> str:
        return (
            f"{self.model_id} is distributed under a non-OSI licence with usage "
            "restrictions (acceptable-use policy; Llama adds a >700M-MAU clause). "
            "Enabled only because NOMETRIA_ACCEPT_RESTRICTED_MODEL_LICENSES=1. "
            "Legal review required before commercial deployment — see Appendix A.4."
        )
