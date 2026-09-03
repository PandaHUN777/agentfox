"""Gateway dependencies — sessions, auth, RBAC.

The role matrix in Appendix C §4 is enforced here. The property that matters for the
product's credibility: ``auditor`` can read everything and mutate nothing. An audit
log an auditor could alter is not an audit log.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_session
from ..models import Agent, User
from ..tenancy import bind_session
from .auth import AuthenticationRequired, authenticate, resolve_agent

# Route family -> roles permitted to mutate. Everyone listed in READ_ROLES may read.
WRITE_ROLES: dict[str, set[str]] = {
    "registry": {"owner", "admin", "security", "developer"},
    "identity": {"owner", "admin", "security"},
    "approvals": {"owner", "admin", "security"},
    "policy": {"owner", "admin", "security", "developer"},
    "policy_production": {"owner", "admin", "security"},
    "eval": {"owner", "admin", "developer"},
    "compliance": {"owner", "admin", "compliance"},
    "evidence": {"owner", "admin", "security", "compliance", "auditor"},
    "users": {"owner", "admin"},
    # P3-14: filing a false positive is open to anyone who can read a decision, but
    # *acting* on one by suppressing a detector is a security decision — a developer
    # silencing a control to unblock a demo is the failure mode this separation exists
    # to prevent.
    "suppressions": {"owner", "admin", "security"},
}

ALL_ROLES = {"owner", "admin", "security", "compliance", "developer", "auditor"}


def db(session: Session = Depends(get_session)) -> Session:
    return session


def get_agent_or_404(session: Session, slug: str) -> Agent:
    """Resolve an agent by slug, or the 404 every agent-slug route needs otherwise."""
    agent = session.scalar(select(Agent).where(Agent.slug == slug))
    if agent is None:
        raise HTTPException(404, f"unknown agent '{slug}'")
    return agent


def current_user(
    request: Request,
    session: Session = Depends(get_session),
    authorization: Annotated[str | None, Header()] = None,
    x_nometria_user: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the control-plane caller and bind their tenant.

    All of the reasoning lives in :mod:`nometria.gateway.auth`, so there is exactly one
    place that decides who a caller is — the previous arrangement documented the
    development shortcut as "confined to this function", which was true and did not
    stop it being live in production.
    """
    try:
        user = authenticate(session, authorization=authorization, header_user=x_nometria_user)
    except AuthenticationRequired as exc:
        raise HTTPException(status_code=401, detail=exc.detail) from exc
    request.state.user = user
    request.state.org_id = user.org_id
    return user


def require(family: str):
    """Dependency factory enforcing write permission for a route family."""

    def _guard(user: User = Depends(current_user)) -> User:
        allowed = WRITE_ROLES.get(family, set())
        if user.role not in allowed:
            raise HTTPException(
                status_code=403,
                detail=(
                    f"role '{user.role}' may not modify '{family}'. Permitted: {sorted(allowed)}."
                ),
            )
        return user

    return _guard


def agent_credential(
    session: Session = Depends(get_session),
    authorization: Annotated[str | None, Header()] = None,
) -> str | None:
    """Extract an agent key from the inline request, and bind that agent's tenant.

    The binding is the part that was missing. Without it every governed completion ran
    in the deployment's default org whatever the agent's owner — and once isolation
    was in place the credential lookup was itself filtered to that org, so an agent in
    any other tenant could not authenticate at all.

    An absent or unrecognised credential is not an error here: the inline path
    deliberately serves unregistered agents so that shadow traffic is *observed*
    rather than turned away (P1-6). It simply stays in the default tenant.
    """
    if not (authorization and authorization.lower().startswith("bearer ")):
        return None
    token = authorization.split(" ", 1)[1]
    if not token.startswith("nom_agt_"):
        return None
    resolved = resolve_agent(session, token)
    if resolved is not None:
        _identity, org_id = resolved
        bind_session(session, org_id)
    return token


def session_iter() -> Iterator[Session]:
    yield from get_session()
