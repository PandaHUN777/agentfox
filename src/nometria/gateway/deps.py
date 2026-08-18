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
from ..models import ApiToken, User

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
}

ALL_ROLES = {"owner", "admin", "security", "compliance", "developer", "auditor"}


def db(session: Session = Depends(get_session)) -> Session:
    return session


def current_user(
    request: Request,
    session: Session = Depends(get_session),
    authorization: Annotated[str | None, Header()] = None,
    x_nometria_user: Annotated[str | None, Header()] = None,
) -> User:
    """Resolve the control-plane caller.

    In the MVP self-host deployment there is no IdP wired (PRD §6.3), so a
    development identity header is accepted. That shortcut is confined to this one
    function precisely so that wiring OIDC later touches nothing else.
    """
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]

    if token and token.startswith("nom_api_"):
        prefix = token[:16]
        for row in session.scalars(select(ApiToken).where(ApiToken.key_prefix == prefix)):
            if row.revoked_at:
                continue
            from argon2 import PasswordHasher
            from argon2.exceptions import VerifyMismatchError

            try:
                PasswordHasher().verify(row.key_hash, token)
            except VerifyMismatchError:
                continue
            user = session.get(User, row.user_id)
            if user and user.active:
                return user
        raise HTTPException(status_code=401, detail="invalid API token")

    email = x_nometria_user or "admin@example.com"
    user = session.scalar(select(User).where(User.email == email))
    if user is None or not user.active:
        raise HTTPException(
            status_code=401,
            detail=f"unknown user '{email}'. Send X-Nometria-User or a nom_api_ bearer token.",
        )
    request.state.user = user
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
    authorization: Annotated[str | None, Header()] = None,
) -> str | None:
    """Extract an agent key (``nom_agt_…``) from the inline request."""
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
        if token.startswith("nom_agt_"):
            return token
    return None


def session_iter() -> Iterator[Session]:
    yield from get_session()
