"""Pillar 4 — Evaluation & Reliability Assurance.

The widest solved-vs-unsolved gap in the stack, and the pillar that separates this
product from a pure-security tool: we govern whether the agent *worked*, not only
whether it was safe (principle X-5).
"""

from . import adapters, drift, gating, redteam, runner, scorers, silent_failure
from .adapters import PromptfooRunner, get_runner
from .drift import DriftReport, evaluate_slos, ks_statistic, psi, set_slo
from .drift import compute as compute_drift
from .gating import GateResult, Regression, gate, set_baseline, to_junit, to_sarif
from .ragas_adapter import (
    RAGAS_METRICS,
    RagasSample,
    RagasScores,
    ragas_available,
    score_dataset,
    score_sample,
)
from .redteam import BUILTIN_PROBES, NativeRedTeamRunner, Probe, run_campaign
from .runner import NativeEvalRunner, fit_envelope, sample_production
from .scorers import ScoreContext, ScoreResult, all_scorers, get_scorer, register_scorer
from .silent_failure import (
    SILENT_FAILURE_SCORERS,
    Envelope,
    groundedness,
    self_consistency,
)

__all__ = [
    "BUILTIN_PROBES",
    "RAGAS_METRICS",
    "RagasSample",
    "RagasScores",
    "ragas_available",
    "score_dataset",
    "score_sample",
    "SILENT_FAILURE_SCORERS",
    "DriftReport",
    "Envelope",
    "GateResult",
    "NativeEvalRunner",
    "NativeRedTeamRunner",
    "Probe",
    "PromptfooRunner",
    "Regression",
    "ScoreContext",
    "ScoreResult",
    "adapters",
    "all_scorers",
    "compute_drift",
    "drift",
    "evaluate_slos",
    "fit_envelope",
    "gate",
    "gating",
    "get_runner",
    "get_scorer",
    "groundedness",
    "ks_statistic",
    "psi",
    "redteam",
    "register_scorer",
    "run_campaign",
    "runner",
    "sample_production",
    "scorers",
    "self_consistency",
    "set_baseline",
    "set_slo",
    "silent_failure",
    "to_junit",
    "to_sarif",
]
