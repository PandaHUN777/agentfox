"""Microsoft Presidio adapter — PII detection (P3-2).

Appendix A.1: MIT, actively maintained, the de-facto OSS standard. The build-vs-reuse
rule is explicit about this one — *rebuilding PII detection from scratch would be
pure duplicated work.* We wrap it and own the policy/action layer above it.

Exposure if Presidio changes status: **low**. It sits behind ``Detector`` and the
native implementation in ``detectors/pii.py`` covers the offline path.
"""

from __future__ import annotations

import functools

from ..base import BaseDetector, Detection, DetectionContext, redact_sample

# Presidio's entity names -> our taxonomy, so a policy written against
# `PII.US_SSN` behaves identically whichever engine produced the finding.
_ENTITY_MAP = {
    "EMAIL_ADDRESS": "PII.EMAIL",
    "PHONE_NUMBER": "PII.US_PHONE",
    "CREDIT_CARD": "PII.CREDIT_CARD",
    "US_SSN": "PII.US_SSN",
    "US_PASSPORT": "PII.US_PASSPORT",
    "US_DRIVER_LICENSE": "PII.US_DRIVER_LICENSE",
    "IBAN_CODE": "PII.IBAN",
    "IP_ADDRESS": "PII.IP_ADDRESS",
    "PERSON": "PII.PERSON",
    "LOCATION": "PII.LOCATION",
    "DATE_TIME": "PII.DATE_OF_BIRTH",
    "MEDICAL_LICENSE": "PII.MEDICAL_LICENSE",
    "UK_NHS": "PII.UK_NHS",
    "UK_NINO": "PII.UK_NINO",
    "IN_AADHAAR": "PII.IN_AADHAAR",
    "IN_PAN": "PII.IN_PAN",
    "CRYPTO": "PII.CRYPTO_WALLET",
}

#: Presidio's PERSON/LOCATION/DATE_TIME recognisers are noisy in agent traffic;
#: excluded by default and re-enabled per policy. A guardrail with poor precision
#: gets switched off (PRD R3).
DEFAULT_EXCLUDED = {"PERSON", "LOCATION", "DATE_TIME"}


@functools.lru_cache(maxsize=1)
def _analyzer():  # pragma: no cover - requires optional dependency
    from presidio_analyzer import AnalyzerEngine

    return AnalyzerEngine()


class PresidioPiiDetector(BaseDetector):
    key = "pii.presidio"
    version = "1.0"
    surfaces = ("input", "output", "tool_args", "tool_result", "retrieved")

    def __init__(self, language: str = "en", excluded: set[str] | None = None) -> None:
        self.language = language
        self.excluded = DEFAULT_EXCLUDED if excluded is None else excluded

    def available(self) -> bool:
        try:
            import presidio_analyzer  # noqa: F401
        except Exception:
            return False
        return True

    def _detect(self, content: str, context: DetectionContext) -> list[Detection]:
        if not content:
            return []
        results = _analyzer().analyze(text=content, language=self.language)
        out: list[Detection] = []
        for r in results:
            if r.entity_type in self.excluded:
                continue
            out.append(
                Detection(
                    entity_type=_ENTITY_MAP.get(r.entity_type, f"PII.{r.entity_type}"),
                    score=float(r.score),
                    start=r.start,
                    end=r.end,
                    sample=redact_sample(content[r.start : r.end]),
                    owasp_id="LLM02",
                    atlas_id="AML.T0057",
                    detail={"engine": "presidio", "presidio_entity": r.entity_type},
                )
            )
        return out
