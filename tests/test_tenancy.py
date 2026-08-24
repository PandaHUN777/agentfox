"""Tenant isolation.

The finding this closes: every table carried an `org_id` and not one query filtered on
it. The fix is deliberately structural rather than diligent — isolation is applied at
the session, so a query that has never heard of tenancy is filtered anyway, and a query
written next year is filtered without its author knowing this module exists.

The tests below are therefore mostly about the *mechanism* holding under things nobody
would think to check: a model added later, a bulk update, a direct primary-key fetch, a
count, the legacy query API, and the threading model of the web framework.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import String, delete, func, select, update
from sqlalchemy.orm import Mapped, mapped_column

from nometria.audit import chain
from nometria.db import session_scope
from nometria.models import Agent, AuditEntry, Base, Finding, TenantScoped, Trace, User
from nometria.tenancy import (
    CrossTenantWrite,
    assert_tenant_safe,
    bind_session,
    current_org,
    session_org,
    system_scope,
    tenant,
)

ACME, GLOBEX = "org_acme", "org_globex"


@pytest.fixture
def two_tenants(isolated_db):
    """Two tenants with identically-shaped data, so a leak is unmistakable."""
    for org, slug in ((ACME, "acme-bot"), (GLOBEX, "globex-bot")):
        with tenant(org), session_scope() as session:
            session.add(Agent(slug=slug, name=slug, environment="production"))
            session.add(Trace(agent_slug=slug))
            session.add(
                Finding(
                    type="leak_probe",
                    severity="high",
                    title=f"SECRET OF {org}",
                    subject_type="agent",
                )
            )
            session.add(User(email=f"admin@{org}.com", name="Admin", role="admin", active=True))
    yield


# ---------------------------------------------------------------------------
# The structural guarantee
# ---------------------------------------------------------------------------


def test_every_model_is_tenant_scoped():
    """A filter you have to remember is not a control; a filter you cannot omit is."""
    assert assert_tenant_safe() == []


def test_a_model_that_escapes_the_mixin_fails_at_import():
    """The realistic failure is someone adding a table next year who has never read the
    tenancy module. That must be an import error, not a data leak found by a customer."""
    from nometria.models import _assert_every_model_is_tenant_scoped

    class Escapee(Base):
        __tablename__ = "escapee_probe"
        id: Mapped[str] = mapped_column(String(40), primary_key=True)

    try:
        with pytest.raises(RuntimeError, match="not tenant-scoped"):
            _assert_every_model_is_tenant_scoped()
    finally:
        Base.registry._dispose_cls(Escapee)
        Base.metadata.remove(Base.metadata.tables["escapee_probe"])


def test_a_model_added_later_is_filtered_without_its_author_knowing(isolated_db):
    """The whole point of session-level enforcement."""

    class LateArrival(Base, TenantScoped):
        __tablename__ = "late_arrival_probe"
        id: Mapped[str] = mapped_column(String(40), primary_key=True)
        note: Mapped[str] = mapped_column(String(80), default="")

    from nometria.db import get_engine

    Base.metadata.create_all(get_engine(), tables=[LateArrival.__table__])
    try:
        with tenant(ACME), session_scope() as session:
            session.add(LateArrival(id="a", note="acme"))
        with tenant(GLOBEX), session_scope() as session:
            session.add(LateArrival(id="b", note="globex"))

        with tenant(ACME), session_scope() as session:
            rows = list(session.scalars(select(LateArrival)))
        assert [r.note for r in rows] == ["acme"], "a brand-new model must be filtered too"
    finally:
        Base.registry._dispose_cls(LateArrival)
        Base.metadata.remove(LateArrival.__table__)


# ---------------------------------------------------------------------------
# Every access path
# ---------------------------------------------------------------------------


def test_select_is_filtered(two_tenants):
    with tenant(ACME), session_scope() as session:
        assert [a.slug for a in session.scalars(select(Agent))] == ["acme-bot"]


def test_primary_key_fetch_is_filtered(two_tenants):
    """`session.get()` bypasses a hand-written where clause entirely, which is why
    per-query filtering would have leaked here."""
    with system_scope("test setup"), session_scope() as session:
        other = session.scalars(select(Agent).where(Agent.slug == "globex-bot")).one().id
    with tenant(ACME), session_scope() as session:
        assert session.get(Agent, other) is None


def test_both_count_forms_are_filtered(two_tenants):
    with tenant(ACME), session_scope() as session:
        assert session.scalar(select(func.count()).select_from(Agent)) == 1
        assert session.scalar(select(func.count(Agent.id))) == 1


def test_the_legacy_query_api_is_filtered(two_tenants):
    with tenant(ACME), session_scope() as session:
        assert session.query(Agent).count() == 1


def test_bulk_update_cannot_cross_tenants(two_tenants):
    """A bulk write that crosses tenants is worse than a read that does."""
    with tenant(ACME), session_scope() as session:
        affected = session.execute(update(Agent).values(name="RENAMED")).rowcount
    assert affected == 1
    with system_scope("verify"), session_scope() as session:
        names = {a.slug: a.name for a in session.scalars(select(Agent))}
    assert names["globex-bot"] == "globex-bot", "the other tenant must be untouched"


def test_bulk_delete_cannot_cross_tenants(two_tenants):
    with tenant(ACME), session_scope() as session:
        assert session.execute(delete(Trace)).rowcount == 1
    with system_scope("verify"), session_scope() as session:
        assert session.scalar(select(func.count()).select_from(Trace)) == 1


def test_the_audit_log_is_isolated(two_tenants):
    """The table that used to escape: it declared org_id inline instead of via the
    mixin, so the most sensitive table in the product was the one left unfiltered."""
    for org in (ACME, GLOBEX):
        with tenant(org), session_scope() as session:
            chain.append(
                session,
                action="probe",
                actor_type="agent",
                actor_id="x",
                subject_type="trace",
                subject_id="t",
                payload={"org": org},
            )
    with tenant(ACME), session_scope() as session:
        entries = list(session.scalars(select(AuditEntry)))
    assert all(e.org_id == ACME for e in entries)
    assert all(e.payload_json.get("org") != GLOBEX for e in entries)


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------


def test_new_rows_are_stamped_without_the_caller_knowing(isolated_db):
    """Relying on the column default is what put rows in the wrong tenant before."""
    with tenant(GLOBEX), session_scope() as session:
        session.add(Agent(slug="stamped", name="stamped"))
    with system_scope("verify"), session_scope() as session:
        assert session.scalars(select(Agent).where(Agent.slug == "stamped")).one().org_id == GLOBEX


def test_a_row_cannot_be_moved_between_tenants(two_tenants):
    """Without this, a row could be read in one tenant and written into another,
    which turns the read filter into a no-op for anyone who can update."""
    with pytest.raises(CrossTenantWrite, match="immutable"):
        with tenant(ACME), session_scope() as session:
            agent = session.scalars(select(Agent)).one()
            agent.org_id = GLOBEX


def test_an_ordinary_update_still_works(two_tenants):
    with tenant(ACME), session_scope() as session:
        session.scalars(select(Agent)).one().name = "renamed"
    with tenant(ACME), session_scope() as session:
        assert session.scalars(select(Agent)).one().name == "renamed"


# ---------------------------------------------------------------------------
# Scope semantics
# ---------------------------------------------------------------------------


def test_unbound_callers_get_the_default_org_not_everything(two_tenants):
    """The failure direction matters: an unbound caller must see one tenant's data —
    a visible, reportable emptiness — rather than every tenant's."""
    with session_scope() as session:
        assert session.scalars(select(Agent)).all() == []
    assert current_org() == "org_default"


def test_system_scope_sees_everything_and_says_so(two_tenants):
    """Requiring a reason makes "who bypasses tenancy?" a list of answers rather than a
    list of call sites."""
    import logging

    records: list[str] = []

    class Capture(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record.getMessage())

    logger = logging.getLogger("nometria.tenancy")
    handler = Capture(level=logging.WARNING)
    logger.addHandler(handler)
    previous = logger.level
    logger.setLevel(logging.WARNING)
    try:
        with system_scope("operator export"), session_scope() as session:
            assert len(list(session.scalars(select(Agent)))) == 2
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous)

    assert any("operator export" in message for message in records)


def test_nesting_restores_the_outer_tenant(isolated_db):
    with tenant(ACME):
        with tenant(GLOBEX):
            assert current_org() == GLOBEX
        assert current_org() == ACME, "a nested scope must not outlive itself"


def test_a_session_binding_beats_the_ambient_default(isolated_db):
    """Sessions carry the tenant because the tenant is a property of the unit of work."""
    with session_scope() as session:
        bind_session(session, GLOBEX)
        assert session_org(session) == GLOBEX
    assert current_org() == "org_default"


def test_an_empty_tenant_is_refused(isolated_db):
    with pytest.raises(ValueError):
        with tenant(""):
            pass


# ---------------------------------------------------------------------------
# Per-tenant audit chains
# ---------------------------------------------------------------------------


def test_each_tenant_has_its_own_verifiable_chain(isolated_db):
    """A single global chain would make A's verification depend on B's entries — you
    cannot check a hash chain you are only allowed to see half of."""
    for i in range(3):
        for org in (ACME, GLOBEX):
            with tenant(org), session_scope() as session:
                chain.append(
                    session,
                    action=f"act{i}",
                    actor_type="agent",
                    actor_id="x",
                    subject_type="trace",
                    subject_id=f"t{i}",
                    payload={"org": org},
                )

    for org in (ACME, GLOBEX):
        with tenant(org), session_scope() as session:
            result = chain.verify_range(session)
        assert result.valid, org
        assert result.entries_checked == 3
        assert (result.first_seq, result.last_seq) == (1, 3), "each chain starts at 1"


def test_interleaved_tenants_do_not_collide_on_sequence(isolated_db):
    for org in (ACME, GLOBEX):
        with tenant(org), session_scope() as session:
            chain.append(
                session,
                action="a",
                actor_type="agent",
                actor_id="x",
                subject_type="t",
                subject_id="1",
                payload={},
            )
    with system_scope("verify"), session_scope() as session:
        pairs = sorted((e.org_id, e.seq) for e in session.scalars(select(AuditEntry)))
    assert pairs == [(ACME, 1), (GLOBEX, 1)]


# ---------------------------------------------------------------------------
# The web layer
# ---------------------------------------------------------------------------


def test_the_api_isolates_tenants(two_tenants):
    from nometria.gateway.app import create_app

    client = TestClient(create_app())
    for org, mine, theirs in ((ACME, "acme-bot", "globex-bot"), (GLOBEX, "globex-bot", "acme-bot")):
        headers = {"X-Nometria-User": f"admin@{org}.com"}
        agents = [a["slug"] for a in client.get("/api/agents", headers=headers).json()["agents"]]
        assert agents == [mine]

        findings = client.get("/api/findings", headers=headers).json()["findings"]
        assert all(org in f["title"] for f in findings)

        # 404 rather than 403: confirming that another tenant's agent exists is itself
        # a disclosure.
        assert client.get(f"/api/agents/{theirs}", headers=headers).status_code == 404


def test_a_context_variable_set_in_a_dependency_does_not_reach_the_handler():
    """The regression test for the first, broken design.

    FastAPI resolves dependencies and runs handlers in separate threadpool contexts, so
    binding the tenant to a context variable in the auth dependency silently did
    nothing — which is why the binding lives on the session instead. This test exists so
    that anyone tempted to 'simplify' it back sees why it cannot work.
    """
    import contextvars

    probe: contextvars.ContextVar[str] = contextvars.ContextVar("probe", default="UNSET")
    app = FastAPI()

    def dependency() -> bool:
        probe.set("SET")
        return True

    @app.get("/sync")
    def sync_endpoint(_: bool = Depends(dependency)) -> dict:
        return {"seen": probe.get()}

    @app.get("/async")
    async def async_endpoint(_: bool = Depends(dependency)) -> dict:
        return {"seen": probe.get()}

    client = TestClient(app)
    assert client.get("/sync").json()["seen"] == "UNSET"
    assert client.get("/async").json()["seen"] == "UNSET"


def test_shared_reference_catalog_syncs_independently_per_org(isolated_db):
    """Regression: Control/FrameworkMapping inherit TimestampMixin like every mapped
    class (assert_tenant_safe requires it), so a plain unique index on Control.key
    alone meant the first org to sync the reference catalog claimed every key —
    every other org's sync then failed with a UniqueViolation while its own
    (correctly tenant-filtered) SELECT reported the row as absent. That looked like a
    catalog that silently refused to load, not a modeling bug; this proves two
    tenants can each hold their own synced copy of the same catalog content.
    """
    from nometria.compliance.catalog import sync_catalog
    from nometria.models import Control

    for org in (ACME, GLOBEX):
        with tenant(org), session_scope() as session:
            result = sync_catalog(session)
            assert result["controls_created"] > 0, f"{org} sync inserted nothing"

    for org in (ACME, GLOBEX):
        with tenant(org), session_scope() as session:
            keys = set(session.scalars(select(Control.key)))
            assert "NOM-DSC-01" in keys, f"{org} cannot see its own synced catalog"

    with system_scope("counting rows across both tenants", routine=True), session_scope() as session:
        acme_count = session.scalar(
            select(func.count()).select_from(Control).where(Control.org_id == ACME)
        )
        globex_count = session.scalar(
            select(func.count()).select_from(Control).where(Control.org_id == GLOBEX)
        )
        total = session.scalar(select(func.count()).select_from(Control))
        assert acme_count > 0 and acme_count == globex_count
        assert total == acme_count + globex_count, "no rows should exist outside the two tenants"


def test_migrations_do_not_switch_off_platform_logging(isolated_db):
    """Regression: Alembic's `fileConfig` defaults to disabling every existing logger.

    Because `init_db` stamps through Alembic, that default silently killed *all*
    Nometria logging on startup — provider degradation, fail-open decisions and
    tenancy bypasses included. A governance product whose warnings stop reaching
    anyone is the failure mode this whole codebase argues against, and it was live.
    """
    import logging

    from nometria.db import init_db

    init_db()
    for name in ("nometria.tenancy", "nometria.enforcement", "nometria.reliability"):
        assert not logging.getLogger(name).disabled, f"{name} was silenced by Alembic"
