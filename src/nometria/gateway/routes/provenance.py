"""P8 — source authority over HTTP.

This pillar shipped with a working engine and **no interface at all**: registering a
source was a Python call, so the only people who could use it were people willing to
import our package and write code against it. A control nobody can reach is not a
control, and it is the reason the audit's usability table concluded that the things
which are trivial are the things that observe while the things that protect are
expert-only.

The tiering decision is the part a business actually has to make — *which of our
sources are systems of record, and which is someone's personal notebook* — so it needs
to be answerable by an operator with a terminal, not only by whoever owns the codebase.
"""

from __future__ import annotations

import datetime as dt
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ...models import SourceRecord, User
from ...provenance import (
    TIERS,
    assess_provenance,
    freshness_breach,
    register_source,
)
from ..deps import current_user, db, require

router = APIRouter(prefix="/api/sources", tags=["provenance"])


class SourceIn(BaseModel):
    key: str = Field(description="The identifier the retriever emits — URI, doc id, table.")
    title: str = ""
    tier: str = Field("unverified", description=" | ".join(TIERS))
    owner: str | None = None
    domain: str | None = Field(None, description="Corpus this belongs to, e.g. 'finance'.")
    updated_at_source: dt.datetime | None = None
    freshness_sla_hours: int | None = None
    deprecated: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.put("", status_code=201)
def upsert(
    payload: SourceIn,
    session: Session = Depends(db),
    _user: User = Depends(require("registry")),
) -> dict[str, Any]:
    """Register or re-tier a source."""
    try:
        record = register_source(
            session,
            payload.key,
            title=payload.title,
            tier=payload.tier,
            owner=payload.owner,
            domain=payload.domain,
            updated_at_source=payload.updated_at_source,
            freshness_sla_hours=payload.freshness_sla_hours,
            deprecated=payload.deprecated,
            metadata=payload.metadata,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return _json(record)


class BulkIn(BaseModel):
    sources: list[SourceIn]


@router.post("/bulk", status_code=201)
def bulk(
    payload: BulkIn,
    session: Session = Depends(db),
    _user: User = Depends(require("registry")),
) -> dict[str, Any]:
    """Register many at once.

    Tiering a corpus is inherently a bulk act — nobody classifies four hundred sources
    one HTTP call at a time, and making them try is how the tiering never happens.
    """
    written = []
    for item in payload.sources:
        try:
            written.append(_json(register_source(session, item.key, **_kwargs(item))))
        except ValueError as exc:
            raise HTTPException(400, f"{item.key}: {exc}") from exc
    return {"registered": len(written), "sources": written}


@router.get("")
def list_sources(
    tier: str | None = None,
    domain: str | None = None,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    stmt = select(SourceRecord).order_by(SourceRecord.tier, SourceRecord.key)
    if tier:
        stmt = stmt.where(SourceRecord.tier == tier)
    if domain:
        stmt = stmt.where(SourceRecord.domain == domain)
    records = list(session.scalars(stmt))
    return {
        "sources": [_json(r) for r in records],
        "tiers": list(TIERS),
        "counts": {t: sum(1 for r in records if r.tier == t) for t in TIERS},
    }


@router.get("/health")
def health(session: Session = Depends(db), _user: User = Depends(current_user)) -> dict[str, Any]:
    """Which registered sources are stale, deprecated, or unowned.

    The question an operator actually has is not "what is registered" but "what is
    rotting" — a tiering exercise done once and never revisited is worse than none,
    because the tier says authoritative long after the content stopped being so.
    """
    records = list(session.scalars(select(SourceRecord)))
    stale, deprecated, unowned = [], [], []
    for record in records:
        breach = freshness_breach(record)
        if breach:
            stale.append(breach)
        if record.deprecated:
            deprecated.append(record.key)
        if not record.owner:
            unowned.append(record.key)
    return {
        "registered": len(records),
        "stale": stale,
        "deprecated": deprecated,
        "unowned": unowned,
        "healthy": len(records) - len({*(b["source"] for b in stale), *deprecated}),
    }


class AssessIn(BaseModel):
    answer: str
    chunks: list[dict[str, Any]] = Field(default_factory=list)
    agent_domain: str | None = None


@router.post("/assess")
def assess(
    payload: AssessIn,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    """Would this answer, from these sources, pass?

    A dry run against real retrieval output, so a team can see what the control would
    say before wiring it into their request path.
    """
    return assess_provenance(
        session, payload.answer, payload.chunks, agent_domain=payload.agent_domain
    ).to_json()


@router.delete("/{key:path}")
def deprecate(
    key: str,
    hard: bool = Query(False, description="Delete rather than mark deprecated."),
    session: Session = Depends(db),
    _user: User = Depends(require("registry")),
) -> dict[str, Any]:
    """Retire a source. Deprecates by default rather than deleting.

    A deleted source silently becomes *unverified* again — the default for anything
    unregistered — where a deprecated one keeps raising a finding every time an answer
    is grounded in it. Losing that signal is exactly the wrong outcome for a source you
    retired because it was wrong.
    """
    record = session.scalar(select(SourceRecord).where(SourceRecord.key == key))
    if record is None:
        raise HTTPException(404, f"unknown source '{key}'")
    if hard:
        session.delete(record)
        return {"deleted": key}
    record.deprecated = True
    session.flush()
    return _json(record)


def _kwargs(item: SourceIn) -> dict[str, Any]:
    return {
        "title": item.title,
        "tier": item.tier,
        "owner": item.owner,
        "domain": item.domain,
        "updated_at_source": item.updated_at_source,
        "freshness_sla_hours": item.freshness_sla_hours,
        "deprecated": item.deprecated,
        "metadata": item.metadata,
    }


def _json(record: SourceRecord) -> dict[str, Any]:
    return {
        "key": record.key,
        "title": record.title,
        "tier": record.tier,
        "owner": record.owner,
        "domain": record.domain,
        "updated_at_source": (
            record.updated_at_source.isoformat() if record.updated_at_source else None
        ),
        "freshness_sla_hours": record.freshness_sla_hours,
        "deprecated": record.deprecated,
        "stale": bool(freshness_breach(record)),
    }
