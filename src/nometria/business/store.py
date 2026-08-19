"""Storage and retrieval of business rules.

Separate from the policy store for the same reason the evaluation is separate: a
ladder is not a rule with more fields, and putting it in the same table would invite
the same list to be evaluated by the same maximum, which is exactly the composition
mistake this whole package exists to avoid.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Agent, BusinessRule
from .ladder import Ladder

log = logging.getLogger(__name__)


def save_ladder(
    session: Session,
    ladder: Ladder,
    *,
    agent_slug: str | None = None,
    enabled: bool = True,
) -> BusinessRule:
    """Upsert a ladder, bumping its version.

    Versions matter here for the same reason they matter for policy: an auditor asking
    why a refund was approved in March needs the thresholds that were in force in
    March, not the ones agreed since.
    """
    agent_id = None
    if agent_slug:
        agent = session.scalar(select(Agent).where(Agent.slug == agent_slug))
        if agent is None:
            raise ValueError(f"unknown agent '{agent_slug}'")
        agent_id = agent.id

    record = session.scalar(select(BusinessRule).where(BusinessRule.key == ladder.key))
    if record is None:
        record = BusinessRule(key=ladder.key)
        session.add(record)
    else:
        record.version += 1

    record.kind = "threshold_ladder"
    record.owner = ladder.owner
    record.description = ladder.description
    record.agent_id = agent_id
    record.tool = ladder.tool
    record.field_path = ladder.field_path
    record.definition_json = ladder.model_dump(by_alias=True, mode="json")
    record.mode = ladder.mode
    record.enabled = enabled
    session.flush()
    return record


def load_ladders(
    session: Session, *, tool: str | None = None, agent_id: str | None = None
) -> list[Ladder]:
    """Every enabled ladder that could apply, newest definition first.

    A definition that no longer validates is skipped and logged rather than raising:
    one malformed rule written months ago must not take the enforcement path down for
    every other rule that is fine.
    """
    stmt = select(BusinessRule).where(BusinessRule.enabled.is_(True))
    if tool is not None:
        stmt = stmt.where((BusinessRule.tool == tool) | (BusinessRule.tool.is_(None)))
    if agent_id is not None:
        stmt = stmt.where((BusinessRule.agent_id == agent_id) | (BusinessRule.agent_id.is_(None)))

    out: list[Ladder] = []
    for record in session.scalars(stmt):
        if record.kind != "threshold_ladder":
            continue
        try:
            out.append(Ladder.model_validate(record.definition_json))
        except Exception as exc:
            log.warning(
                "business rule '%s' no longer validates and was skipped: %s", record.key, exc
            )
    return out


def all_ladders(session: Session) -> list[Ladder]:
    return load_ladders(session)


def set_mode(session: Session, key: str, mode: str) -> BusinessRule:
    record = session.scalar(select(BusinessRule).where(BusinessRule.key == key))
    if record is None:
        raise ValueError(f"unknown business rule '{key}'")
    if mode not in ("observe", "enforce"):
        raise ValueError("mode must be 'observe' or 'enforce'")
    record.mode = mode
    definition = dict(record.definition_json or {})
    definition["mode"] = mode
    record.definition_json = definition
    session.flush()
    return record


def summary(session: Session) -> dict[str, Any]:
    records = list(session.scalars(select(BusinessRule)))
    return {
        "rules": len(records),
        "enabled": sum(1 for r in records if r.enabled),
        "enforcing": sum(1 for r in records if r.mode == "enforce" and r.enabled),
        "owners": sorted({r.owner for r in records if r.owner}),
        "by_kind": {
            kind: sum(1 for r in records if r.kind == kind)
            for kind in sorted({r.kind for r in records})
        },
    }
