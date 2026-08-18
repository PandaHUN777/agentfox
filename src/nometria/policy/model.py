"""Declarative policy model (P6-1).

The catalog's advice is to put OPA/Rego underneath rather than hand-roll an engine —
and we do (``policy/opa.py``). But Rego is not a language a CISO or a GRC lead will
read, review or sign off, and *"write once, enforce at runtime **and** report"* is
the whole point of the pillar. So the authored artefact is this declarative YAML,
which compiles to either evaluator.

A policy version is immutable (X-4). Every ``Decision`` records the exact version in
force, which is what stops "that rule was always on" retro-fitting (Appendix E.1.5).
"""

from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass, field
from typing import Any, Literal

import yaml
from pydantic import BaseModel, Field, field_validator

Effect = Literal["allow", "redact", "mask", "tokenize", "block", "escalate"]

#: Effect precedence — a decision takes the strongest effect any rule produced.
EFFECT_RANK: dict[str, int] = {
    "allow": 0,
    "tokenize": 1,
    "mask": 2,
    "redact": 3,
    "escalate": 4,
    "block": 5,
}

COMPARATORS = {
    "eq": lambda a, b: a == b,
    "ne": lambda a, b: a != b,
    "gt": lambda a, b: _num(a) > _num(b),
    "gte": lambda a, b: _num(a) >= _num(b),
    "lt": lambda a, b: _num(a) < _num(b),
    "lte": lambda a, b: _num(a) <= _num(b),
    "in": lambda a, b: a in b,
    "not_in": lambda a, b: a not in b,
    "contains": lambda a, b: str(b).lower() in str(a).lower(),
    "matches": lambda a, b: bool(re.search(str(b), str(a))),
}


def _num(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("nan")


class DetectionCondition(BaseModel):
    entity: str | None = None
    entity_prefix: str | None = None
    min_score: float = 0.5
    min_count: int = 1


class ArgumentCondition(BaseModel):
    path: str
    op: str = "eq"
    value: Any = None

    @field_validator("op")
    @classmethod
    def _known_op(cls, v: str) -> str:
        if v not in COMPARATORS:
            raise ValueError(f"unknown operator '{v}'; expected one of {sorted(COMPARATORS)}")
        return v


class Condition(BaseModel):
    """All present fields must match (AND). Absent fields are ignored."""

    surface: list[str] | None = None
    environment: list[str] | None = None
    agent: str | None = None  # glob on slug
    risk_tier: list[str] | None = None
    tool: str | None = None  # glob on tool key
    tool_impact: list[str] | None = None
    detection: DetectionCondition | None = None
    argument: ArgumentCondition | None = None
    #: Fires when argument provenance is more dangerous than this level.
    taint_exceeds: str | None = None
    capability: str | None = None  # denied | requires_approval | granted
    budget_exceeded: bool | None = None
    loop_detected: bool | None = None
    intent_declared: bool | None = None
    detector_degraded: bool | None = None
    #: Escape hatch for conditions the schema does not model yet.
    expr: str | None = None


class Rule(BaseModel):
    id: str
    description: str = ""
    when: Condition = Field(default_factory=Condition)
    effect: Effect = "block"
    reason: str = ""
    #: Controls this rule provides evidence for (feeds P6-4 continuous monitoring).
    controls: list[str] = Field(default_factory=list)
    severity: str = "medium"
    enabled: bool = True
    #: Redaction style when effect is redact/mask/tokenize.
    redaction: str = "mask"


class PolicyDocument(BaseModel):
    key: str
    name: str = ""
    description: str = ""
    version: int = 1
    #: observe never blocks; it records what *would* have happened (PRD R3).
    mode: Literal["observe", "enforce"] = "observe"
    default_effect: Effect = "allow"
    fail_mode: Literal["open", "closed"] = "open"
    scope: dict[str, Any] = Field(default_factory=dict)
    rules: list[Rule] = Field(default_factory=list)

    @classmethod
    def from_yaml(cls, body: str) -> PolicyDocument:
        return cls.model_validate(yaml.safe_load(body) or {})

    def to_yaml(self) -> str:
        return yaml.safe_dump(self.model_dump(exclude_none=True), sort_keys=False)

    def matches_scope(self, agent_slug: str | None, environment: str | None) -> bool:
        agents = self.scope.get("agents")
        if agents and agent_slug:
            if not any(fnmatch.fnmatch(agent_slug, pattern) for pattern in agents):
                return False
        envs = self.scope.get("environments")
        if envs and environment and environment not in envs:
            return False
        return True


# ---------------------------------------------------------------------------
# Evaluation input / output
# ---------------------------------------------------------------------------


@dataclass
class PolicyInput:
    """Everything the engine reasons over.

    Note what is here that a model-era filter does not have: ``tool_impact``,
    ``taint`` provenance per argument, ``prior_tools``, and the capability decision.
    That is the difference between "is this string bad" and "should this action
    happen" (P3-4).
    """

    agent_slug: str | None = None
    risk_tier: str = "limited"
    environment: str = "production"
    surface: str = "input"
    tool_key: str | None = None
    tool_impact: str = "read"
    arguments: dict[str, Any] = field(default_factory=dict)
    intent: str | None = None
    detections: list[dict[str, Any]] = field(default_factory=list)
    taint: dict[str, Any] = field(default_factory=dict)
    capability: dict[str, Any] = field(default_factory=dict)
    budget: dict[str, Any] = field(default_factory=dict)
    prior_tools: list[str] = field(default_factory=list)
    detector_degraded: bool = False

    def to_json(self) -> dict[str, Any]:
        return {
            "agent": self.agent_slug,
            "risk_tier": self.risk_tier,
            "environment": self.environment,
            "surface": self.surface,
            "tool": self.tool_key,
            "tool_impact": self.tool_impact,
            "arguments": self.arguments,
            "intent": self.intent,
            "detections": self.detections,
            "taint": self.taint,
            "capability": self.capability,
            "budget": self.budget,
            "prior_tools": self.prior_tools,
            "detector_degraded": self.detector_degraded,
        }


@dataclass
class FiredRule:
    rule_id: str
    effect: str
    reason: str
    severity: str = "medium"
    controls: list[str] = field(default_factory=list)
    redaction: str = "mask"

    def to_json(self) -> dict[str, Any]:
        return {
            "rule_id": self.rule_id,
            "effect": self.effect,
            "reason": self.reason,
            "severity": self.severity,
            "controls": self.controls,
        }


@dataclass
class PolicyDecision:
    verdict: str = "allow"
    rules_fired: list[FiredRule] = field(default_factory=list)
    policy_key: str | None = None
    policy_version: int | None = None
    mode: str = "observe"
    #: What the verdict *would* have been in enforce mode. In observe mode the
    #: caller is not blocked, but this is what gets reported and simulated against.
    effective_verdict: str = "allow"
    engine: str = "native"

    @property
    def blocked(self) -> bool:
        return self.verdict == "block"

    @property
    def redactions(self) -> list[FiredRule]:
        return [r for r in self.rules_fired if r.effect in ("redact", "mask", "tokenize")]

    def to_json(self) -> dict[str, Any]:
        return {
            "verdict": self.verdict,
            "effective_verdict": self.effective_verdict,
            "mode": self.mode,
            "engine": self.engine,
            "policy": self.policy_key,
            "policy_version": self.policy_version,
            "rules_fired": [r.to_json() for r in self.rules_fired],
        }
