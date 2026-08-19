"""F2 source authority and F7 numeric/temporal/entity integrity.

Two families that survive every other control. F2 is the one our own groundedness
scorer is blind to by construction: it checks the answer against the retrieved
context and never asks whether that context was authoritative, so an answer
faithfully grounded in a deprecated 2019 wiki page scores 1.0.

F7 is the one every *language* metric is blind to. Groundedness asks whether the
claim is supported by the text; it does not ask whether 5 + 3 = 9, or whether "Q1" in
the question means the same three months as "Q1" in the source.
"""

from __future__ import annotations

import datetime as dt

import pytest

from nometria.integrity import (
    assess_integrity,
    check_arithmetic,
    detect_entity_confusion,
    detect_period_mismatch,
    detect_timezone_ambiguity,
    detect_unit_mismatch,
    detect_unmatched_records,
)
from nometria.models import Agent, Finding, utcnow
from nometria.provenance import (
    APPROVED,
    EXTERNAL,
    SYSTEM_OF_RECORD,
    UNVERIFIED,
    assess_provenance,
    detect_fabricated_citations,
    detect_source_conflict,
    domain_breach,
    freshness_breach,
    register_source,
    source_tier,
    tier_allows,
    uncited_claims,
)

# ---------------------------------------------------------------------------
# F2.1 — source tier
# ---------------------------------------------------------------------------


def test_an_unregistered_source_is_unverified_not_approved(seeded):
    """Defaulting the other way makes the control vacuous the moment a retriever
    emits something new."""
    assert source_tier(seeded, "wiki/random-page") == UNVERIFIED


def test_tiers_are_ordered_so_the_weakest_source_wins(seeded):
    assert tier_allows(APPROVED, SYSTEM_OF_RECORD), "a stronger tier satisfies a weaker demand"
    assert not tier_allows(SYSTEM_OF_RECORD, APPROVED)
    assert not tier_allows(APPROVED, EXTERNAL)


def test_an_answer_is_only_as_authoritative_as_its_worst_source(seeded):
    register_source(seeded, "price-book", tier=SYSTEM_OF_RECORD)
    register_source(seeded, "someones-onenote", tier=UNVERIFIED)
    assessment = assess_provenance(
        seeded,
        "Pricing is £40 [price-book] and £45 in practice [someones-onenote].",
        [
            {"source": "price-book", "text": "price is 40"},
            {"source": "someones-onenote", "text": "price is 45"},
        ],
    )
    assert assessment.weakest_tier == UNVERIFIED


def test_perfect_groundedness_against_a_deprecated_source_is_still_caught(seeded):
    """The whole of F2 in one test: the answer is faithful to its context and the
    context should never have been used."""
    register_source(seeded, "wiki-2019", tier=APPROVED, deprecated=True)
    assessment = assess_provenance(
        seeded,
        "The refund window is 30 days [wiki-2019].",
        [{"source": "wiki-2019", "text": "refund window is 30 days"}],
    )
    assert [b["kind"] for b in assessment.breaches] == ["deprecated_source"]


# ---------------------------------------------------------------------------
# F2.2 — freshness
# ---------------------------------------------------------------------------


def test_a_stale_source_breaches_its_sla(seeded):
    record = register_source(
        seeded,
        "policy-index",
        tier=APPROVED,
        freshness_sla_hours=24,
        updated_at_source=utcnow() - dt.timedelta(days=30),
    )
    breach = freshness_breach(record)
    assert breach and breach["sla_hours"] == 24
    assert breach["age_hours"] > 24


def test_a_fresh_source_does_not(seeded):
    record = register_source(
        seeded, "policy-index", freshness_sla_hours=24, updated_at_source=utcnow()
    )
    assert freshness_breach(record) is None


def test_an_sla_with_no_recorded_update_is_a_breach(seeded):
    """Not knowing how old a source is, when the policy says it must be fresh, is not
    the same as it being fresh."""
    record = register_source(seeded, "mystery-index", freshness_sla_hours=24)
    assert freshness_breach(record) is not None


def test_a_source_without_an_sla_is_not_checked(seeded):
    assert freshness_breach(register_source(seeded, "static-doc")) is None


# ---------------------------------------------------------------------------
# F2.6 — domain
# ---------------------------------------------------------------------------


def test_a_support_agent_answering_from_the_finance_corpus_is_flagged(seeded):
    record = register_source(seeded, "gl-extract", tier=SYSTEM_OF_RECORD, domain="finance")
    breach = domain_breach(record, "support")
    assert breach and breach["source_domain"] == "finance"


def test_a_matching_domain_is_fine(seeded):
    record = register_source(seeded, "kb-article", domain="support")
    assert domain_breach(record, "support") is None


# ---------------------------------------------------------------------------
# F2.3 — fabricated citations
# ---------------------------------------------------------------------------


def test_a_citation_to_a_document_that_was_never_retrieved(seeded):
    found = detect_fabricated_citations(
        "The limit is 500 [policy-v9].", [{"source": "policy-v3", "text": "the limit is 500"}]
    )
    assert [f["kind"] for f in found] == ["unknown_source"]


def test_a_real_document_cited_for_a_figure_it_does_not_contain(seeded):
    """The common case, and the one that survives review: the reference resolves, so a
    human spot-checking the link sees a real page."""
    found = detect_fabricated_citations(
        "The limit is 900 [policy-v3].", [{"source": "policy-v3", "text": "the limit is 500"}]
    )
    assert found[0]["kind"] == "unsupported_claim"
    assert "900" in found[0]["missing_figures"]


def test_a_correct_citation_is_not_flagged(seeded):
    assert (
        detect_fabricated_citations(
            "The limit is 500 [policy-v3].", [{"source": "policy-v3", "text": "the limit is 500"}]
        )
        == []
    )


def test_ordinary_brackets_are_not_treated_as_citations(seeded):
    """A loose pattern turns prose into citations and manufactures findings."""
    assert detect_fabricated_citations("We refunded it [see note].", [{"source": "x"}]) == []


# ---------------------------------------------------------------------------
# F2.4 — silent conflict
# ---------------------------------------------------------------------------


def test_two_sources_that_disagree_are_surfaced(seeded):
    conflicts = detect_source_conflict(
        [
            {"source": "a", "text": "The refund window is 30 days"},
            {"source": "b", "text": "The refund window is 14 days"},
        ]
    )
    assert conflicts[0]["values"] == ["14", "30"]
    assert conflicts[0]["sources"] == ["a", "b"]


def test_agreeing_sources_produce_no_conflict(seeded):
    assert (
        detect_source_conflict(
            [
                {"source": "a", "text": "The refund window is 30 days"},
                {"source": "b", "text": "The refund window is 30 days"},
            ]
        )
        == []
    )


def test_a_single_source_cannot_conflict(seeded):
    assert detect_source_conflict([{"source": "a", "text": "The limit is 5"}]) == []


# ---------------------------------------------------------------------------
# F2.5 — uncited claims
# ---------------------------------------------------------------------------


def test_a_material_claim_with_no_citation_is_reported(seeded):
    uncited = uncited_claims(
        "The limit is 500. Contact Support for more.", [{"source": "policy", "text": "..."}]
    )
    assert any("500" in c for c in uncited)


def test_nothing_is_demanded_when_retrieval_returned_nothing(seeded):
    """Demanding citations from an agent that was given nothing to cite is a bug
    report about the retriever, not about the answer."""
    assert uncited_claims("The limit is 500.", []) == []


# ---------------------------------------------------------------------------
# F7.1 — hallucinated record match
# ---------------------------------------------------------------------------


def test_a_record_that_was_never_retrieved_is_caught():
    """The reconciliation incident."""
    found = detect_unmatched_records("Matched to ORD-99999.", [{"id": "ORD-11111"}])
    assert found[0]["identifier"] == "ORD-99999"


def test_a_retrieved_record_is_not_flagged():
    assert detect_unmatched_records("Matched to ORD-11111.", [{"id": "ORD-11111"}]) == []


def test_quantities_and_dates_are_not_mistaken_for_identifiers():
    assert detect_unmatched_records("We shipped 42 units on 2024-01-05.", [{"id": "X"}]) == []


def test_nothing_is_checked_when_no_records_were_supplied():
    assert detect_unmatched_records("Matched to ORD-99999.", None) == []


# ---------------------------------------------------------------------------
# F7.2 — arithmetic
# ---------------------------------------------------------------------------


def test_stated_arithmetic_is_verified():
    assert check_arithmetic("5 + 3 = 9")[0]["actual"] == 8.0
    assert check_arithmetic("5 + 3 = 8") == []


def test_a_total_is_checked_against_the_rows_cited():
    issues = check_arithmetic("The total is 120", components=[50.0, 55.0])
    assert issues[0]["kind"] == "aggregation_error"
    assert issues[0]["actual"] == 105.0


def test_rounding_is_not_reported_as_an_error():
    """Tolerance is relative, so a rounded currency figure is not an arithmetic bug."""
    assert check_arithmetic("The total is 1000000.4", components=[1000000.0, 0.0]) == []


# ---------------------------------------------------------------------------
# F7.3 — period
# ---------------------------------------------------------------------------


def test_fiscal_versus_calendar_is_detected():
    """The expensive case: both parties say "2024" and mean date ranges that overlap
    by nine months, so the answer looks right to everyone in the room."""
    issues = detect_period_mismatch("what was FY2024 revenue?", "In calendar year 2024, £4m.")
    assert issues[0]["kind"] == "fiscal_calendar_mismatch"


def test_answering_a_different_quarter_is_detected():
    issues = detect_period_mismatch("Q1 numbers please", "In Q3 we saw 12 orders")
    assert issues[0]["kind"] == "quarter_mismatch"


def test_the_same_quarter_is_fine():
    assert detect_period_mismatch("Q1 numbers please", "In Q1 we saw 12 orders") == []


def test_a_period_absent_from_the_context_is_flagged():
    issues = detect_period_mismatch("revenue?", "In 2021 revenue was £3m", context="2024 data only")
    assert any(i["kind"] == "period_not_in_context" for i in issues)


# ---------------------------------------------------------------------------
# F7.4 — units and currency
# ---------------------------------------------------------------------------


def test_a_currency_the_source_never_stated_is_flagged():
    issues = detect_unit_mismatch("Revenue was $4m", "Revenue was €4m")
    assert issues[0]["kind"] == "currency_mismatch"


def test_mixing_currencies_without_a_conversion_is_flagged():
    assert any(i["kind"] == "mixed_currency" for i in detect_unit_mismatch("£10 plus $20"))


def test_thousands_read_as_millions_is_flagged():
    issues = detect_unit_mismatch("Revenue was 4 million", "Revenue was 4 thousand")
    assert issues[0]["kind"] == "scale_mismatch"


def test_matching_units_are_fine():
    assert detect_unit_mismatch("Revenue was €4m", "Revenue was €4m") == []


# ---------------------------------------------------------------------------
# F7.5, F7.6
# ---------------------------------------------------------------------------


def test_the_right_answer_about_the_wrong_customer():
    issues = detect_entity_confusion(
        "how is Acme Corp doing?", "Acme Holdings had 12 orders", ["Acme Corp", "Acme Holdings"]
    )
    assert issues[0]["answered_about"] == ["Acme Holdings"]


def test_the_right_entity_is_not_flagged():
    assert (
        detect_entity_confusion(
            "how is Acme Corp doing?", "Acme Corp had 12 orders", ["Acme Corp", "Acme Holdings"]
        )
        == []
    )


def test_entity_confusion_needs_a_declared_entity_list():
    """Inferring entities from prose would flag every product name and place."""
    assert detect_entity_confusion("how is Acme doing?", "Globex had 12 orders", None) == []


def test_a_bare_deadline_time_is_ambiguous():
    assert detect_timezone_ambiguity("Your appeal is due by 5:00 pm")
    assert not detect_timezone_ambiguity("Your appeal is due by 5:00 pm UTC")


def test_ordinary_times_are_not_flagged():
    """Flagging every clock time is noise; a deadline is where the off-by-one costs."""
    assert detect_timezone_ambiguity("The call started at 9:00 am") == []


# ---------------------------------------------------------------------------
# Combined assessment and the enforcement path
# ---------------------------------------------------------------------------


def test_a_clean_answer_produces_no_issues():
    assert assess_integrity(
        question="Q1 orders?", answer="In Q1 there were 12 orders.", context="Q1: 12 orders"
    ).clean


def test_the_assessment_collects_every_family():
    assessment = assess_integrity(
        question="what were FY2024 orders for Acme Corp?",
        answer="In calendar year 2024, Acme Holdings had 5 + 3 = 9 orders, matched to ORD-99999.",
        records=[{"id": "ORD-11111"}],
        entities=["Acme Corp", "Acme Holdings"],
    )
    assert {"fiscal_calendar_mismatch", "entity_confusion", "arithmetic_error"} <= set(
        assessment.kinds
    )


@pytest.fixture
def agent(seeded) -> Agent:
    return seeded.query(Agent).filter_by(slug="support-triage").one()


def test_evidence_issues_become_findings_not_blocks(seeded, enforcer, agent):
    """The failure this addresses is *silent* wrongness — surfacing it is the control.
    Blocking would withhold a mostly-correct answer over a currency mismatch."""
    register_source(seeded, "wiki-2019", tier=APPROVED, deprecated=True)
    enforcer.evidence = {
        "chunks": [{"source": "wiki-2019", "text": "the limit is 500"}],
        "question": "what is the limit?",
    }
    result = enforcer.evaluate(
        agent=agent, identity=None, content="The limit is 500 [wiki-2019].", surface="output"
    )
    assert not result.blocked
    assert seeded.query(Finding).filter_by(type="source_authority").count() == 1
    assert result.taint["provenance"]["weakest_tier"] == APPROVED


def test_no_evidence_supplied_means_no_guessing(seeded, enforcer, agent):
    """An integrity check that invents its own ground truth is worse than none."""
    enforcer.evidence = {}
    result = enforcer.evaluate(
        agent=agent, identity=None, content="The limit is 900 [nowhere].", surface="output"
    )
    assert "provenance" not in result.taint
    assert seeded.query(Finding).filter_by(type="fabricated_citation").count() == 0


def test_checks_do_not_run_on_the_input_surface(seeded, enforcer, agent):
    enforcer.evidence = {"chunks": [{"source": "a", "text": "x"}]}
    result = enforcer.evaluate(
        agent=agent, identity=None, content="The limit is 900 [b].", surface="input"
    )
    assert "provenance" not in result.taint
