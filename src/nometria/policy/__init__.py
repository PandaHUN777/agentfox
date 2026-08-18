"""Pillars 2/3/6 — the policy layer.

One authored artefact drives both runtime enforcement and compliance reporting
(P6-1). Two interchangeable engines implement it: a deterministic native evaluator
(the default, and the offline path) and OPA/Rego (the scale and expressiveness
upgrade). They are cross-verified in the test suite, which is what keeps the
"swappable" claim in PRD §9.4 honest.
"""

from __future__ import annotations

from .engine import NativePolicyEngine, PolicyEngine, combine
from .model import (
    EFFECT_RANK,
    Condition,
    DetectionCondition,
    Effect,
    FiredRule,
    PolicyDecision,
    PolicyDocument,
    PolicyInput,
    Rule,
)
from .opa import OpaPolicyEngine, compile_to_rego
from .simulate import SimulationDiff, record_simulation, simulate
from .store import (
    active_policies,
    get_engine,
    history,
    load_from_dir,
    save_policy,
    set_mode,
)

__all__ = [
    "EFFECT_RANK",
    "Condition",
    "DetectionCondition",
    "Effect",
    "FiredRule",
    "NativePolicyEngine",
    "OpaPolicyEngine",
    "PolicyDecision",
    "PolicyDocument",
    "PolicyEngine",
    "PolicyInput",
    "Rule",
    "SimulationDiff",
    "active_policies",
    "combine",
    "compile_to_rego",
    "get_engine",
    "history",
    "load_from_dir",
    "record_simulation",
    "save_policy",
    "set_mode",
    "simulate",
]
