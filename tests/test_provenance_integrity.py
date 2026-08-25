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
import hashlib

import httpx
import pytest
from sqlalchemy import select

from nometria.integrity import (
    assess_integrity,
    check_arithmetic,
    detect_entity_confusion,
    detect_period_mismatch,
    detect_timezone_ambiguity,
    detect_unit_mismatch,
    detect_unmatched_records,
)
from nometria.models import Agent, Finding, SourceRecord, utcnow
from nometria.provenance import (
    APPROVED,
    CHANGED,
    EXTERNAL,
    NOT_FETCHABLE,
    SYSTEM_OF_RECORD,
    UNREACHABLE,
    UNVERIFIED,
    VALID,
    assess_provenance,
    detect_fabricated_citations,
    detect_source_conflict,
    domain_breach,
    freshness_breach,
    register_connection,
    register_source,
    source_tier,
    tier_allows,
    uncited_claims,
    validate_source,
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
# F2 — content validation: a tier is a claim, this is us actually checking
# ---------------------------------------------------------------------------


def test_a_non_url_key_is_reported_not_fetchable_rather_than_faked(seeded):
    """A table name or doc id has nothing behind it to GET — validating it should
    say so honestly, not silently mark it valid."""
    register_source(seeded, "warehouse.finance.q3_actuals", tier=SYSTEM_OF_RECORD)
    result = validate_source(seeded, "warehouse.finance.q3_actuals")
    assert result["status"] == NOT_FETCHABLE
    record = seeded.scalar(select(SourceRecord).where(SourceRecord.key == "warehouse.finance.q3_actuals"))
    assert record.last_validation_status == NOT_FETCHABLE
    assert record.last_validated_at is not None


def test_a_url_source_is_hashed_and_marked_valid_on_first_check(seeded, monkeypatch):
    url = "https://docs.example.com/pricing"
    register_source(seeded, url, tier=APPROVED)

    class _Resp:
        content = b"pricing content v1"

        def raise_for_status(self):
            pass

    monkeypatch.setattr("nometria.provenance.httpx.get", lambda *a, **k: _Resp())
    result = validate_source(seeded, url)
    assert result["status"] == VALID
    assert result["content_hash"] == hashlib.sha256(b"pricing content v1").hexdigest()


def test_changed_content_is_flagged_against_the_previously_recorded_hash(seeded, monkeypatch):
    """The tier a human assigned may no longer describe what's actually there — that's
    exactly the gap a name-only 'validation' can't see."""
    url = "https://docs.example.com/pricing"
    register_source(seeded, url, tier=APPROVED)

    class _RespV1:
        content = b"pricing content v1"

        def raise_for_status(self):
            pass

    monkeypatch.setattr("nometria.provenance.httpx.get", lambda *a, **k: _RespV1())
    first = validate_source(seeded, url)
    assert first["status"] == VALID

    class _RespV2:
        content = b"pricing content v2 -- silently changed"

        def raise_for_status(self):
            pass

    monkeypatch.setattr("nometria.provenance.httpx.get", lambda *a, **k: _RespV2())
    second = validate_source(seeded, url)
    assert second["status"] == CHANGED


def test_an_unreachable_url_is_reported_rather_than_silently_passed(seeded, monkeypatch):
    url = "https://docs.example.com/gone"
    register_source(seeded, url, tier=APPROVED)

    def _explode(*a, **k):
        raise httpx.ConnectError("no route to host")

    monkeypatch.setattr("nometria.provenance.httpx.get", _explode)
    result = validate_source(seeded, url)
    assert result["status"] == UNREACHABLE
    record = seeded.scalar(select(SourceRecord).where(SourceRecord.key == url))
    assert record.last_validation_status == UNREACHABLE


def test_validating_an_unregistered_source_is_an_error(seeded):
    with pytest.raises(ValueError):
        validate_source(seeded, "https://docs.example.com/never-registered")


# ---------------------------------------------------------------------------
# Source connections — a database or an enterprise API, not just a URL
# ---------------------------------------------------------------------------


@pytest.fixture
def encryption_key(monkeypatch):
    from cryptography.fernet import Fernet

    from nometria.config import reset_settings_cache

    monkeypatch.setenv("NOMETRIA_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    reset_settings_cache()
    yield
    reset_settings_cache()


def test_a_credential_is_never_stored_in_the_clear(seeded, encryption_key):
    register_source(seeded, "internal-crm", tier=APPROVED)
    connection = register_connection(
        seeded,
        "internal-crm",
        kind="database",
        config={"dialect": "postgresql", "host": "db.internal", "database": "crm"},
        credential="hunter2",
    )
    assert connection.credential_encrypted is not None
    assert "hunter2" not in connection.credential_encrypted


def test_registering_a_connection_without_a_source_is_an_error(seeded, encryption_key):
    with pytest.raises(ValueError):
        register_connection(seeded, "never-registered", kind="api", config={})


def test_an_unknown_connection_kind_is_rejected(seeded):
    register_source(seeded, "some-source")
    with pytest.raises(ValueError):
        register_connection(seeded, "some-source", kind="ftp", config={})


def test_a_database_connection_validates_by_introspecting_schema(seeded, tmp_path):
    """No enterprise DB driver needed for this — SQLite is a real SQLAlchemy dialect,
    so this exercises the actual connect-and-introspect path, not a mock of it."""
    db_path = tmp_path / "crm.db"
    import sqlite3

    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE customers (id INTEGER, name TEXT)")
    conn.commit()
    conn.close()

    register_source(seeded, "crm-db", tier=SYSTEM_OF_RECORD)
    register_connection(
        seeded, "crm-db", kind="database", config={"dialect": "sqlite", "database": str(db_path)}
    )

    first = validate_source(seeded, "crm-db")
    assert first["status"] == VALID

    # Schema drift: a table appears that wasn't there at the last check.
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE orders (id INTEGER)")
    conn.commit()
    conn.close()

    second = validate_source(seeded, "crm-db")
    assert second["status"] == CHANGED


def test_a_database_connection_that_cannot_connect_is_unreachable(seeded):
    register_source(seeded, "unreachable-db", tier=UNVERIFIED)
    register_connection(
        seeded,
        "unreachable-db",
        kind="database",
        config={"dialect": "sqlite", "database": "/nonexistent/path/does-not-exist.db"},
    )
    result = validate_source(seeded, "unreachable-db")
    assert result["status"] == UNREACHABLE


def test_an_api_connection_sends_the_decrypted_credential(seeded, encryption_key, monkeypatch):
    register_source(seeded, "confluence-space", tier=APPROVED)
    register_connection(
        seeded,
        "confluence-space",
        kind="api",
        config={"base_url": "https://wiki.example.com/api/space", "auth_header": "Authorization"},
        credential="secret-token-123",
    )

    seen = {}

    def fake_get(url, *, headers=None, timeout=None, follow_redirects=None):
        seen["url"] = url
        seen["headers"] = headers

        class _Resp:
            content = b"space contents"

            def raise_for_status(self):
                pass

        return _Resp()

    monkeypatch.setattr("nometria.provenance.httpx.get", fake_get)
    result = validate_source(seeded, "confluence-space")
    assert result["status"] == VALID
    assert seen["url"] == "https://wiki.example.com/api/space"
    assert seen["headers"]["Authorization"] == "Bearer secret-token-123"


def test_a_source_with_no_connection_still_falls_back_to_a_plain_url_check(seeded, monkeypatch):
    """Registering a connection is opt-in — a source with none behaves exactly as
    before, so existing sources don't silently change behaviour."""
    register_source(seeded, "https://docs.example.com/plain", tier=APPROVED)

    class _Resp:
        content = b"plain content"

        def raise_for_status(self):
            pass

    monkeypatch.setattr("nometria.provenance.httpx.get", lambda *a, **k: _Resp())
    result = validate_source(seeded, "https://docs.example.com/plain")
    assert result["status"] == VALID


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
