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
    # Presidio's DATE_TIME recognizer flags any date-shaped mention (a statement
    # date, an event date), not specifically a birthdate — mapping it to
    # PII.DATE_OF_BIRTH overclaims what was actually found (benchmarked: 1.6-21.3%
    # precision against that label in benchmarks/pii/). PII.DATE_TIME names it for
    # what it is; `detectors/pii.py`'s own regex still owns PII.DATE_OF_BIRTH.
    "DATE_TIME": "PII.DATE_TIME",
    "MEDICAL_LICENSE": "PII.MEDICAL_LICENSE",
    "UK_NHS": "PII.UK_NHS",
    "UK_NINO": "PII.UK_NINO",
    "IN_AADHAAR": "PII.IN_AADHAAR",
    "IN_PAN": "PII.IN_PAN",
    "CRYPTO": "PII.CRYPTO_WALLET",
}

#: Presidio's PERSON/LOCATION/DATE_TIME recognisers are noisy in agent traffic;
#: excluded by default and re-enabled per policy. A guardrail with poor precision
#: gets switched off (PRD R3). US_DRIVER_LICENSE joins them per
#: benchmarks/pii/README.md: 3.2%/0.9% precision across two independent
#: datasets — its low-specificity alphanumeric-ID pattern fires on account
#: numbers, reference IDs, and other short codes far more often than on actual
#: driver's licenses.
DEFAULT_EXCLUDED = {"PERSON", "LOCATION", "DATE_TIME", "US_DRIVER_LICENSE"}

#: Presidio's own confidence score is discrete, not continuous, and for some
#: recognisers the low tier is cleanly separable from real hits rather than a
#: gradient. Benchmarked on gretelai/synthetic_pii_finance_multilingual
#: (benchmarks/pii/README.md): US_SSN's 0.05 ("regex matched, no context words
#: nearby") tier accounts for 444 of 453 false positives — bare 9-digit codes
#: in dense financial documents (account numbers, routing numbers) — against
#: only 7 of 76 true positives at that same tier. Filtering it out trades ~9%
#: of this recogniser's recall for roughly a 6x precision gain. Not applied
#: elsewhere: US_DRIVER_LICENSE's true and false positives are scored across
#: the *same* tiers with no clean cut point (see README), so a threshold
#: there would just be arbitrary — that recogniser is excluded by default
#: instead (see DEFAULT_EXCLUDED above).
_MIN_SCORE: dict[str, float] = {"US_SSN": 0.1}


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
            if r.score < _MIN_SCORE.get(r.entity_type, 0.0):
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
