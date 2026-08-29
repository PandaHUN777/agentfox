"""FastAPI dependency resolving a playground sandbox from its path `session_id`.

Split out from `playground.py` only so the per-action rate limit is applied in
exactly one place, shared by every route that takes a `session_id` path param,
rather than repeated at the top of each handler.
"""

from __future__ import annotations

from fastapi import HTTPException

from ..playground_sessions import PlaygroundSession, action_limiter, get_store


def playground_session(session_id: str) -> PlaygroundSession:
    record = get_store().get(session_id)
    if record is None:
        raise HTTPException(
            404, "This playground sandbox has expired or never existed — create a new one."
        )
    if not action_limiter.check(session_id):
        raise HTTPException(429, "Slow down — too many actions on this sandbox in the last minute.")
    return record
