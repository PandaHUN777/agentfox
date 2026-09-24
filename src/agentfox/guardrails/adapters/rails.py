"""Guardrail-orchestration adapters — NeMo Guardrails and Guardrails AI (P3-1/P3-9).

Both are Apache-2.0 and actively maintained (Appendix A.1), and the catalog's advice
is "compose checks; don't hand-roll the runner". We take that seriously but not
literally: our pipeline is the primary runner because it has to enforce the latency
budget (NFR-1), record per-detector telemetry (P3-11), and feed control status
(P6-4) — none of which these projects model. They are wrapped as *detectors inside*
our pipeline, which is the same wrap-the-primitive-own-the-interface split used
everywhere else.

Licence caution carried from Appendix A.1: the Guardrails AI **core** is Apache-2.0,
but individual Guardrails Hub validators carry their own licences. Any Hub validator
must be licence-checked before it ships, so none is enabled by default.
"""

from __future__ import annotations

import functools
from typing import Any

from ..base import BaseDetector, Detection, DetectionContext, redact_sample


class NemoRailsDetector(BaseDetector):
    """NVIDIA NeMo Guardrails — programmable rails (Colang)."""

    key = "rails.nemo"
    version = "1.0"
    surfaces = ("input", "output")

    def __init__(self, config_path: str | None = None) -> None:
        self.config_path = config_path

    def available(self) -> bool:
        if not self.config_path:
            return False
        try:
            import nemoguardrails  # noqa: F401
        except Exception:
            return False
        return True

    @functools.cached_property
    def _rails(self):  # pragma: no cover - requires optional dependency
        from nemoguardrails import LLMRails, RailsConfig

        return LLMRails(RailsConfig.from_path(self.config_path))

    def _detect(
        self, content: str, context: DetectionContext
    ) -> list[Detection]:  # pragma: no cover
        if not content:
            return []
        result = self._rails.generate(messages=[{"role": "user", "content": content}])
        text = result.get("content", "") if isinstance(result, dict) else str(result)
        # NeMo signals refusal by producing a refusal message rather than a verdict,
        # so a rail that fires is detected by the bot declining to proceed.
        if "i'm not able to" in text.lower() or "i cannot" in text.lower():
            return [
                Detection(
                    entity_type="RAILS.BLOCKED",
                    score=0.9,
                    end=len(content),
                    sample=redact_sample(text, keep=24),
                    detail={"engine": "nemoguardrails", "config": self.config_path},
                )
            ]
        return []


class GuardrailsAiDetector(BaseDetector):
    """Guardrails AI validators — structured output and I/O validation."""

    key = "rails.guardrails_ai"
    version = "1.0"
    surfaces = ("output", "tool_args")

    def __init__(self, validators: list[Any] | None = None) -> None:
        # Empty by default: Hub validators carry independent licences (Appendix A.1).
        self.validators = validators or []

    def available(self) -> bool:
        if not self.validators:
            return False
        try:
            import guardrails  # noqa: F401
        except Exception:
            return False
        return True

    @functools.cached_property
    def _guard(self):  # pragma: no cover - requires optional dependency
        from guardrails import Guard

        return Guard().use_many(*self.validators)

    def _detect(
        self, content: str, context: DetectionContext
    ) -> list[Detection]:  # pragma: no cover
        if not content:
            return []
        outcome = self._guard.parse(content)
        if getattr(outcome, "validation_passed", True):
            return []
        return [
            Detection(
                entity_type="SCHEMA.VIOLATION",
                score=1.0,
                end=len(content),
                sample="guardrails-ai validation failed",
                owasp_id="LLM05",
                detail={
                    "engine": "guardrails-ai",
                    "summaries": [str(s) for s in getattr(outcome, "validation_summaries", [])][
                        :10
                    ],
                },
            )
        ]
