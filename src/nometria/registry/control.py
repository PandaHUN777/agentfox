"""PL-3 — kill switch and quarantine.

The control every competitor ships and we did not. Design decisions worth stating:

* **Reversible.** An irreversible kill switch is one nobody dares use, so it stays
  unused during the incident it was built for. Both states resume cleanly.
* **Audited on both edges.** Stopping an agent and restarting it are equally
  interesting to an auditor — "who turned it back on, and why" is the harder question.
* **Checked before anything else.** `Enforcer.preflight` consults this before taint,
  detectors or policy. A killed agent must not reach a model even if every policy
  would have allowed it.
* **Two states, not one.** `quarantined` ("we are investigating") and `killed`
  ("stop now") block identically but declare different intent, and an incident review
  will ask which was declared.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import chain
from ..models import Agent, AgentControl, Finding, utcnow

STATES = ("active", "quarantined", "killed")


class UnknownAgent(Exception):
    pass


def _agent(session: Session, slug: str) -> Agent:
    agent = session.scalar(select(Agent).where(Agent.slug == slug))
    if agent is None:
        raise UnknownAgent(f"unknown agent '{slug}'")
    return agent


def get_control(session: Session, slug: str) -> AgentControl | None:
    agent = _agent(session, slug)
    return session.scalar(select(AgentControl).where(AgentControl.agent_id == agent.id))


def state_of(session: Session, slug: str) -> str:
    control = get_control(session, slug)
    return control.state if control else "active"


def set_state(
    session: Session,
    slug: str,
    state: str,
    *,
    reason: str = "",
    actor: str = "system",
) -> AgentControl:
    """Transition an agent between active / quarantined / killed."""
    if state not in STATES:
        raise ValueError(f"state must be one of {STATES}")
    agent = _agent(session, slug)

    control = session.scalar(select(AgentControl).where(AgentControl.agent_id == agent.id))
    if control is None:
        control = AgentControl(agent_id=agent.id, state="active")
        session.add(control)
        session.flush()

    previous = control.state
    if previous == state:
        return control

    control.previous_state = previous
    control.state = state
    control.reason = reason or None
    control.actor = actor
    control.changed_at = utcnow()
    session.flush()

    chain.append(
        session,
        f"agent.{state}" if state != "active" else "agent.resumed",
        actor_type="user",
        actor_id=actor,
        subject_type="agent",
        subject_id=agent.id,
        payload={
            "agent": agent.slug,
            "from": previous,
            "to": state,
            "reason": reason,
        },
    )

    # A stopped agent is a governance event a human should see, not just a log line.
    if state in ("quarantined", "killed"):
        session.add(
            Finding(
                type="agent_stopped",
                severity="critical" if state == "killed" else "high",
                title=f"Agent '{agent.slug}' {state} by {actor}",
                subject_type="agent",
                subject_id=agent.id,
                evidence_json={"from": previous, "to": state, "reason": reason, "actor": actor},
                control_keys=["NOM-DSC-02", "NOM-IAM-03"],
            )
        )
    session.flush()
    return control


def quarantine(session: Session, slug: str, *, reason: str = "", actor: str = "system"):
    return set_state(session, slug, "quarantined", reason=reason, actor=actor)


def kill(session: Session, slug: str, *, reason: str = "", actor: str = "system"):
    return set_state(session, slug, "killed", reason=reason, actor=actor)


def resume(session: Session, slug: str, *, reason: str = "", actor: str = "system"):
    return set_state(session, slug, "active", reason=reason, actor=actor)


def all_controls(session: Session) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for control in session.scalars(select(AgentControl)):
        agent = session.get(Agent, control.agent_id)
        out.append(
            {
                "agent": agent.slug if agent else control.agent_id,
                "state": control.state,
                "previous_state": control.previous_state,
                "reason": control.reason,
                "actor": control.actor,
                "changed_at": control.changed_at.isoformat() if control.changed_at else None,
            }
        )
    return out
