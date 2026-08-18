"""Pillar 3 — Runtime Guardrails & Security.

Detector registration happens here so that importing ``nometria.guardrails`` gives
you a working, offline-capable detector set with no optional dependency installed
(X-3). Wrapped OSS adapters register too, but report ``available() == False`` until
their dependency (and, for classifiers, their weights) are actually present.
"""

from __future__ import annotations

from .adapters.classifiers import GraniteGuardianDetector, RestrictedClassifierDetector
from .adapters.presidio import PresidioPiiDetector
from .adapters.rails import GuardrailsAiDetector, NemoRailsDetector
from .base import (
    SURFACES,
    TAINT_ORDER,
    BaseDetector,
    Detection,
    DetectionContext,
    Detector,
    DetectorResult,
    all_detectors,
    available_detectors,
    get_detector,
    redact_sample,
    register_detector,
    taint_rank,
)
from .detectors.injection import InjectionHeuristicDetector
from .detectors.pii import NativePiiDetector, redact_content
from .detectors.safety import SafetyLexiconDetector
from .detectors.schema import JsonSchemaDetector
from .detectors.secrets import SecretsDetector
from .pipeline import DetectorPipeline, PipelineResult, fail_verdict
from .taint import TaintMark, TaintTracker, exceeds

# --- Native, always available (offline default) ---
register_detector(InjectionHeuristicDetector())
register_detector(NativePiiDetector())
register_detector(SecretsDetector())
register_detector(SafetyLexiconDetector())
register_detector(JsonSchemaDetector())

# --- Wrapped OSS, available when installed ---
register_detector(PresidioPiiDetector())
register_detector(GraniteGuardianDetector())
register_detector(NemoRailsDetector())
register_detector(GuardrailsAiDetector())

# --- Licence-restricted, opt-in only (Appendix A.4) ---
register_detector(RestrictedClassifierDetector())

__all__ = [
    "SURFACES",
    "TAINT_ORDER",
    "BaseDetector",
    "Detection",
    "DetectionContext",
    "Detector",
    "DetectorPipeline",
    "DetectorResult",
    "GraniteGuardianDetector",
    "GuardrailsAiDetector",
    "InjectionHeuristicDetector",
    "JsonSchemaDetector",
    "NativePiiDetector",
    "NemoRailsDetector",
    "PipelineResult",
    "PresidioPiiDetector",
    "RestrictedClassifierDetector",
    "SafetyLexiconDetector",
    "SecretsDetector",
    "TaintMark",
    "TaintTracker",
    "all_detectors",
    "available_detectors",
    "exceeds",
    "fail_verdict",
    "get_detector",
    "redact_content",
    "redact_sample",
    "register_detector",
    "taint_rank",
]
