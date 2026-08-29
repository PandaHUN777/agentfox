"""Ephemeral, per-visitor sandboxes for the public playground.

The playground (`routes/playground.py`) lets an anonymous website visitor attack a
real agent and get a real enforcement verdict, without an account and without ever
touching the deployment's actual database. Each visitor's "world" is a throwaway
in-memory SQLite database, seeded with the same deterministic demo fixtures
`nometria demo` uses (`seed.seed`) — real enforcement code, a fake shared database.

This is deliberately separate from `db.py`'s engine/sessionmaker, which are
process-global singletons bound to the one configured deployment database
(Postgres or a real SQLite file) — there is no supported way to get a second,
independent in-memory database out of that path, and there should not be one: it
exists to guarantee every request sees the same database, which is the opposite of
what a per-visitor sandbox needs.
"""

from __future__ import annotations

import threading
import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ..models import Base
from ..seed import seed as seed_world
from ..tenancy import bind_session
from ..tenancy import install as install_tenancy

#: How long an idle sandbox survives before being swept. Generous enough for a
#: visitor to read the report and come back, short enough that a public, unbounded
#: link doesn't accumulate sandboxes forever.
SESSION_TTL_SECONDS = 30 * 60

#: Hard cap on concurrently-live sandboxes. Bounds memory under public traffic —
#: the oldest idle sandbox is evicted rather than refusing new visitors.
MAX_SESSIONS = 200

#: Every playground sandbox binds to this tenant. It does no isolation work by
#: itself — isolation comes from each sandbox being a wholly separate in-memory
#: engine — it exists only because the tenancy layer (`tenancy.py`) requires every
#: session to have *some* bound org before a query or write touches a
#: `TenantScoped` table.
PLAYGROUND_ORG = "playground"

#: Cap on how many trace ids a sandbox remembers for its own "what happened"
#: sidebar. Old traces are simply forgotten, not deleted — the sandbox itself is
#: swept as a whole on TTL expiry.
MAX_REMEMBERED_TRACES = 50


@dataclass
class PlaygroundSession:
    id: str
    engine: Any
    sessionmaker: sessionmaker
    created_at: float = field(default_factory=time.monotonic)
    last_used: float = field(default_factory=time.monotonic)
    #: trace ids created in this sandbox, most recent last — what `/state` reads
    #: back to build the live decisions/detector-runs/findings feed.
    trace_ids: list[str] = field(default_factory=list)

    def open(self) -> Session:
        session = self.sessionmaker()
        bind_session(session, PLAYGROUND_ORG)
        self.last_used = time.monotonic()
        return session

    @contextmanager
    def session_scope(self) -> Iterator[Session]:
        session = self.open()
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def remember_trace(self, trace_id: str | None) -> None:
        if not trace_id:
            return
        self.trace_ids.append(trace_id)
        del self.trace_ids[:-MAX_REMEMBERED_TRACES]


class PlaygroundStore:
    """In-process registry of live sandboxes.

    Per gateway worker, like the rate limiters below — an accepted limitation for
    a single always-on demo container (see `docker-compose.yml`'s own note on
    SQLite being single-writer/single-process for the same underlying reason),
    not a bug to fix here.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, PlaygroundSession] = {}
        self._lock = threading.Lock()

    def create(self) -> PlaygroundSession:
        self._sweep()
        with self._lock:
            if len(self._sessions) >= MAX_SESSIONS:
                oldest = min(self._sessions.values(), key=lambda s: s.last_used)
                self._evict_locked(oldest.id)

        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(engine)
        factory = install_tenancy(
            sessionmaker(bind=engine, expire_on_commit=False, future=True)
        )
        record = PlaygroundSession(
            id=f"pg_{uuid.uuid4().hex[:20]}", engine=engine, sessionmaker=factory
        )

        session = record.open()
        try:
            seed_world(session)
            session.commit()
        finally:
            session.close()

        with self._lock:
            self._sessions[record.id] = record
        return record

    def get(self, session_id: str) -> PlaygroundSession | None:
        self._sweep()
        with self._lock:
            return self._sessions.get(session_id)

    def _evict_locked(self, session_id: str) -> None:
        record = self._sessions.pop(session_id, None)
        if record is not None:
            record.engine.dispose()

    def _sweep(self) -> None:
        cutoff = time.monotonic() - SESSION_TTL_SECONDS
        with self._lock:
            stale = [sid for sid, rec in self._sessions.items() if rec.last_used < cutoff]
            for sid in stale:
                self._evict_locked(sid)


_store = PlaygroundStore()


def get_store() -> PlaygroundStore:
    return _store


class RateLimiter:
    """In-process sliding-window limiter. No new dependency (`slowapi`/`limits` are
    not used anywhere in this project) — a public, unauthenticated, model-backed
    endpoint just needs *a* bound on abuse, not a distributed one, on a single
    always-on container.
    """

    def __init__(self, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> bool:
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            hits = [t for t in self._hits.get(key, []) if t > cutoff]
            if len(hits) >= self.limit:
                self._hits[key] = hits
                return False
            hits.append(now)
            self._hits[key] = hits
            return True


#: New sandboxes per client address. Each one seeds a fresh DB and (if the
#: classifier ensemble is enabled) runs real model inference — bounded per-IP so
#: this can't be turned into a free compute sink.
session_creation_limiter = RateLimiter(limit=8, window_seconds=3600)

#: Actions (chat / tool-call / enforce-toggle / state) per sandbox. High enough for
#: a human clicking around, low enough to bound a scripted hammer on one session.
action_limiter = RateLimiter(limit=40, window_seconds=60)
