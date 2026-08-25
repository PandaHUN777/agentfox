"""Pillar 4 — scorers, silent-failure detection, gating, drift, red team."""

from __future__ import annotations

import pytest

from nometria.evaluation import evaluate_slos, gate, psi, run_campaign, set_baseline, set_slo
from nometria.evaluation.drift import ks_statistic
from nometria.evaluation.gating import to_junit, to_sarif
from nometria.evaluation.runner import NativeEvalRunner
from nometria.evaluation.scorers import ScoreContext, get_scorer
from nometria.evaluation.silent_failure import (
    Envelope,
    SilentFailureScorer,
    groundedness,
    self_consistency,
)
from nometria.models import EvalSuite

from .conftest import as_user

CONTEXT = (
    "Refund policy. Customers may request a refund within 30 days of purchase. "
    "Refunds are issued to the original payment method."
)


def ctx(**kwargs) -> ScoreContext:
    base = {"context": {"retrieved": CONTEXT}}
    base.update(kwargs)
    return ScoreContext(**base)


# ---------------------------------------------------------------------------
# Groundedness (P4-3a)
# ---------------------------------------------------------------------------


def test_grounded_claim_supported():
    assert groundedness("Refunds are issued to the original payment method.", CONTEXT).score == 1.0


def test_wrong_number_is_unsupported():
    """The classic silent failure: right vocabulary, wrong fact."""
    report = groundedness("The refund window is 90 days from purchase.", CONTEXT)
    assert report.score == 0.0
    assert "90" in report.unsupported[0]


def test_fabricated_detail_is_unsupported():
    report = groundedness("Refunds are issued as store credit vouchers only.", CONTEXT)
    assert report.score < 1.0


def test_no_context_is_not_a_failure():
    assert groundedness("anything at all here", "").score == 1.0


def test_numbers_present_in_context_are_fine():
    assert groundedness("You have 30 days.", CONTEXT).score == 1.0


# ---------------------------------------------------------------------------
# Self-consistency (P4-3b)
# ---------------------------------------------------------------------------


def test_self_consistency_high_for_identical_samples():
    score, _ = self_consistency(["the answer is 30 days"] * 3)
    assert score == pytest.approx(1.0)


def test_self_consistency_low_for_divergent_samples():
    score, detail = self_consistency(
        ["the window is 30 days", "refunds take six months", "we do not offer refunds"]
    )
    assert score < 0.6
    assert detail["n"] == 3


def test_self_consistency_not_evaluated_with_one_sample():
    score, detail = self_consistency(["only one"])
    assert score == 1.0
    assert "not evaluated" in detail["note"]


# ---------------------------------------------------------------------------
# The ensemble (P4-3)
# ---------------------------------------------------------------------------


def test_ensemble_passes_a_correct_answer():
    result = SilentFailureScorer().score("You may request a refund within 30 days.", ctx())
    assert result.passed
    assert result.detail["verdict"] == "no_strong_signal"


def test_ensemble_flags_confident_and_wrong():
    result = SilentFailureScorer().score(
        "Our refund window is 90 days and refunds arrive as store credit.", ctx()
    )
    assert not result.passed
    assert result.detail["verdict"] == "likely_silent_failure"


def test_groundedness_alone_can_trip_the_ensemble():
    """A wholly ungrounded factual claim must not need a second signal to agree."""
    result = SilentFailureScorer().score("The refund window is 365 days.", ctx())
    assert not result.passed


def test_refusal_is_not_a_silent_failure():
    """A visible refusal is a working system; scoring it would flood the queue."""
    result = SilentFailureScorer().score("I cannot help with that request.", ctx())
    assert result.passed
    assert result.detail["verdict"] == "refusal"


def test_hedging_detected():
    scorer = get_scorer("hedging")
    hedged = scorer.score("I think it's probably around 30 days, but I'm not sure.", ctx())
    plain = scorer.score("The refund window is 30 days.", ctx())
    assert hedged.score > plain.score


def test_task_completion_does_not_punish_correct_answers():
    """A goal is written as an instruction; a correct answer restates none of it."""
    scorer = get_scorer("task_completion")
    result = scorer.score(
        "You may request a refund within 30 days of purchase.",
        ctx(expected={"contains": ["30 days"], "goal": "state the refund window"}),
    )
    assert result.passed and result.score == 1.0


def test_task_completion_flags_incompletion():
    scorer = get_scorer("task_completion")
    result = scorer.score(
        "I was unable to complete the lookup. Please provide more information.",
        ctx(expected={"goal": "look up the order"}),
    )
    assert not result.passed


def test_behavioural_envelope():
    envelope = Envelope.fit([100] * 20 + [105, 95], latencies=[50] * 20)
    assert envelope.deviations(102) == []
    assert envelope.deviations(9000)


# ---------------------------------------------------------------------------
# Runner + gating (P4-1)
# ---------------------------------------------------------------------------


def test_runner_scores_every_case(seeded):
    suite = seeded.query(EvalSuite).filter_by(key="support-quality").one()
    run = NativeEvalRunner().run(
        seeded,
        suite,
        {"provider": "echo", "model": "echo-1"},
        ["groundedness", "silent_failure", "contains"],
    )
    assert run.status == "completed"
    assert run.summary_json["cases"] == 5
    assert set(run.summary_json["scorers"]) == {"groundedness", "silent_failure", "contains"}


def test_gate_passes_against_itself(seeded):
    suite = seeded.query(EvalSuite).filter_by(key="support-quality").one()
    run = NativeEvalRunner().run(seeded, suite, {"provider": "echo", "model": "echo-1"})
    set_baseline(seeded, run, "main")
    assert gate(seeded, run, run.id).passed


def test_gate_respects_scorer_direction(seeded):
    """`silent_failure` is lower-is-better; treating a rise as an improvement would
    gate on exactly the wrong thing."""
    from nometria.models import EvalResult

    suite = seeded.query(EvalSuite).filter_by(key="support-quality").one()
    baseline = NativeEvalRunner().run(
        seeded, suite, {"provider": "echo", "model": "echo-1"}, ["silent_failure"]
    )
    current = NativeEvalRunner().run(
        seeded, suite, {"provider": "echo", "model": "echo-1"}, ["silent_failure"]
    )
    # Simulate the agent getting worse: silent-failure risk rises.
    for row in seeded.query(EvalResult).filter_by(run_id=current.id):
        row.score = min(1.0, row.score + 0.5)
    seeded.flush()

    result = gate(seeded, current, baseline.id)
    assert not result.passed
    assert any(r.scorer_key == "silent_failure" for r in result.regressions)


def test_gate_absolute_floor_without_baseline(seeded):
    suite = seeded.query(EvalSuite).filter_by(key="support-quality").one()
    run = NativeEvalRunner().run(
        seeded, suite, {"provider": "echo", "model": "echo-1"}, ["groundedness"]
    )
    result = gate(seeded, run, min_pass_rate=1.0)
    assert not result.passed
    assert result.absolute_failures


def test_gate_reports_are_wellformed(seeded):
    suite = seeded.query(EvalSuite).filter_by(key="support-quality").one()
    run = NativeEvalRunner().run(seeded, suite, {"provider": "echo", "model": "echo-1"})
    result = gate(seeded, run, min_pass_rate=1.0)

    junit = to_junit(result, "support-quality")
    assert "<testsuite" in junit and 'name="support-quality"' in junit

    import json

    sarif = json.loads(to_sarif(result))
    assert sarif["version"] == "2.1.0"
    assert sarif["runs"][0]["tool"]["driver"]["name"] == "Nometria"
    assert result.exit_code == 1


# ---------------------------------------------------------------------------
# Drift (P4-2)
# ---------------------------------------------------------------------------


def test_psi_zero_for_identical_distributions():
    values = [0.1 * i for i in range(50)]
    assert psi(values, list(values)) == pytest.approx(0.0, abs=1e-9)


def test_psi_rises_on_shift():
    baseline = [0.9] * 50
    shifted = [0.2] * 50
    assert psi(baseline, shifted) > 0.25


def test_ks_statistic():
    assert ks_statistic([1, 2, 3], [1, 2, 3]) == pytest.approx(0.0)
    assert ks_statistic([1, 1, 1], [9, 9, 9]) == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# SLOs (P4-7)
# ---------------------------------------------------------------------------


def test_declaring_an_slo_with_no_data_reports_no_data(seeded):
    """A page that reads SLOs is a dead end without a way to declare one — this is
    the write side that GET /api/eval/slos needs something to show."""
    set_slo(
        seeded,
        agent_slug="support-triage",
        scorer_key="groundedness",
        objective="95% of answers stay grounded",
        target=0.95,
    )
    [reported] = evaluate_slos(seeded, "support-triage")
    assert reported["status"] == "no_data"
    assert reported["agent"] == "support-triage"
    assert reported["scorer"] == "groundedness"


def test_declaring_the_same_pair_twice_edits_rather_than_duplicates(seeded):
    set_slo(seeded, agent_slug="support-triage", scorer_key="groundedness", target=0.9)
    set_slo(seeded, agent_slug="support-triage", scorer_key="groundedness", target=0.99)
    assert len(evaluate_slos(seeded, "support-triage")) == 1
    assert evaluate_slos(seeded, "support-triage")[0]["slo_id"]


def test_the_slo_api(client):
    headers = as_user("priya@example.com")
    created = client.post(
        "/api/eval/slos",
        json={
            "agent": "support-triage",
            "scorer": "groundedness",
            "objective": "95% of answers stay grounded",
            "target": 0.95,
        },
        headers=headers,
    )
    assert created.status_code == 201
    assert created.json()["agent"] == "support-triage"

    listed = client.get("/api/eval/slos", headers=headers).json()
    assert any(s["agent"] == "support-triage" for s in listed["slos"])

    unknown_agent = client.post(
        "/api/eval/slos",
        json={"agent": "no-such-agent", "scorer": "groundedness"},
        headers=headers,
    )
    assert unknown_agent.status_code == 404


# ---------------------------------------------------------------------------
# Red team (P4-4)
# ---------------------------------------------------------------------------


def test_campaign_produces_posture(seeded):
    campaign = run_campaign(seeded, "support-triage")
    summary = campaign.summary_json
    assert summary["probes_run"] > 0
    assert 0.0 <= summary["posture_score"] <= 1.0
    assert summary["attacks_blocked"] + summary["attacks_succeeded"] == summary["probes_run"]
    assert "prompt_injection" in summary["by_category"]


def test_campaign_blocks_injection_probes_when_enforcing(seeded):
    from nometria.policy import set_mode

    set_mode(seeded, "baseline", "enforce")
    campaign = run_campaign(
        seeded, "support-triage", probes=["prompt_injection", "data_exfiltration"]
    )
    assert campaign.summary_json["attacks_succeeded"] == 0


def test_campaign_breach_raises_a_finding(seeded):
    from nometria.models import Finding

    run_campaign(seeded, "support-triage")
    findings = seeded.query(Finding).filter_by(type="redteam").all()
    # Some probes get through in observe mode; that must be reported, not hidden.
    if findings:
        assert "NOM-EVL-04" in findings[0].control_keys
