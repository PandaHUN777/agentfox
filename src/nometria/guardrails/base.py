"""Detector interface — the build-vs-reuse seam for Pillar 3 (PRD §9.4).

Every runtime primitive, ours or wrapped OSS, implements :class:`Detector`. That is
what makes the claim in PRD §12 ("wrap the primitive, own the interface") a tested
property rather than an aspiration: swapping Presidio for something else, or
dropping a project that gets archived (Appendix A.3), touches one adapter file.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable

# Surfaces a detector can run on. The agent-native point is that `input` is the
# *least* interesting one: indirect injection arrives via retrieved content and
# tool results (Appendix E.1.1).
SURFACES = ("input", "output", "tool_args", "tool_result", "retrieved")

# Trust sources, ordered least → most dangerous. Used for taint comparison.
TAINT_ORDER = ("none", "user", "retrieved", "tool_result", "subagent", "memory")


def taint_rank(source: str) -> int:
    try:
        return TAINT_ORDER.index(source)
    except ValueError:
        return len(TAINT_ORDER)


@dataclass(slots=True)
class Detection:
    """One located finding inside a piece of content.

    ``sample`` is redacted at construction (P5-5 / R8): we store enough to explain
    the decision to a human and never enough to re-leak the value.
    """

    entity_type: str
    score: float
    start: int = 0
    end: int = 0
    sample: str = ""
    owasp_id: str | None = None
    atlas_id: str | None = None
    detail: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DetectionContext:
    """Everything a detector may need beyond the raw string."""

    surface: str = "input"
    agent_slug: str | None = None
    trace_id: str | None = None
    tool_key: str | None = None
    tool_impact: str = "read"
    intent: str | None = None
    taint_source: str = "user"
    schema: dict[str, Any] | None = None
    prior_tools: list[str] = field(default_factory=list)
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DetectorResult:
    detector_key: str
    version: str
    score: float = 0.0
    detections: list[Detection] = field(default_factory=list)
    status: str = "ok"  # ok | timeout | error | skipped_budget | unavailable
    duration_ms: float = 0.0
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def triggered(self) -> bool:
        return bool(self.detections)


@runtime_checkable
class Detector(Protocol):
    key: str
    version: str
    surfaces: tuple[str, ...]

    def available(self) -> bool:
        """False when an optional dependency or model weight is absent.

        Unavailable detectors degrade the pipeline rather than failing it — that is
        what makes the offline default (X-3) work without pretending coverage exists.
        """
        ...

    def detect(self, content: str, context: DetectionContext) -> DetectorResult: ...


class BaseDetector:
    """Convenience base: subclasses implement :meth:`_detect`."""

    key: str = "base"
    version: str = "1"
    surfaces: tuple[str, ...] = SURFACES

    def available(self) -> bool:  # pragma: no cover - overridden by adapters
        return True

    def detect(self, content: str, context: DetectionContext) -> DetectorResult:
        detections = self._detect(content or "", context)
        score = max((d.score for d in detections), default=0.0)
        return DetectorResult(
            detector_key=self.key,
            version=self.version,
            score=score,
            detections=detections,
        )

    def _detect(self, content: str, context: DetectionContext) -> list[Detection]:
        raise NotImplementedError


# --------------------------------------------------------------------------
# Redaction — applied at capture, never after the fact
# --------------------------------------------------------------------------

_WS = re.compile(r"\s+")


def redact_sample(value: str, keep: int = 4, max_len: int = 80) -> str:
    """Return a sample safe to persist.

    Keeps a short prefix so a human can recognise *what kind* of thing matched,
    masks the rest. An audit log that stores the SSN it detected is a new
    liability, not a control (Appendix E.2.2).
    """
    value = _WS.sub(" ", (value or "").strip())
    if not value:
        return ""
    if len(value) <= keep:
        return "*" * len(value)
    visible = value[:keep]
    masked = "*" * min(len(value) - keep, max_len - keep)
    return f"{visible}{masked}"


def snippet(value: str, start: int, end: int, window: int = 40) -> str:
    """A redacted window around a match, for explaining a block to a developer."""
    lo = max(0, start - window)
    hi = min(len(value), end + window)
    before = _WS.sub(" ", value[lo:start])
    after = _WS.sub(" ", value[end:hi])
    return f"…{before}[{redact_sample(value[start:end])}]{after}…"


# --------------------------------------------------------------------------
# Registry
# --------------------------------------------------------------------------

_REGISTRY: dict[str, Detector] = {}


def register_detector(detector: Detector) -> Detector:
    _REGISTRY[detector.key] = detector
    return detector


def get_detector(key: str) -> Detector | None:
    return _REGISTRY.get(key)


def all_detectors() -> dict[str, Detector]:
    return dict(_REGISTRY)


def available_detectors() -> dict[str, Detector]:
    return {k: d for k, d in _REGISTRY.items() if d.available()}
