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
        from transformers import pipeline

        return pipeline("text-classification", model=self.model_id, top_k=None)

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
