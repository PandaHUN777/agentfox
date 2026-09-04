"""Persisted backend for jobs.py's enqueue/run/retry/dead-letter interface.

`jobs.py`'s `JobQueue` is deliberately in-process (see its own docstring) — the
right choice for `nometria demo`, the CLI, and tests, where one process's memory
is all there is. It is the wrong choice for the two operations gap-analysis.md
named as the actual candidates for this (evidence-package export, red-team-
campaign runs): those run behind a serverless HTTP handler, where a `deque` in
one invocation's memory is gone the instant that invocation returns, and the
next request — even a retry of the exact same job — gets a fresh, empty queue.
A dead-lettered job in that world isn't "public state", it's a value that
existed for a few hundred milliseconds and was never seen by anyone.

So this module keeps the interface, swaps the backend to Postgres/SQLite (the
same "native default, swappable seam" pattern already used for the policy
engine and entitlement), and makes one deliberate simplification for this
deployment target: rather than a separate always-on worker polling a queue
(the classic shape, and the one Redis/SQS would give for free), a job is
enqueued and run in the same request that created it. That still buys the two
things jobs.py's docstring says actually matter — a transient failure gets
retried instead of just failing the request, and a permanent failure is a
`Job` row with `status="dead"` a human can find later, not a bare 500 nobody
recorded — without inventing an async polling UI Vercel's own cron-frequency
limits (once/day on the Hobby tier this ships on) would make painfully slow
for something a person is sitting in a browser waiting on. `run_pending()` is
still exposed and still wired to a cron-triggered endpoint (`POST
/api/internal/jobs/run`) as a backstop for a job that gets stuck in `running`
because the request that started it crashed or hit a platform timeout
mid-attempt — not the primary path, but real recovery for the one failure mode
same-request processing can't cover.
"""

from __future__ import annotations

import logging
import traceback
from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .jobs import DEAD, DONE, PENDING, RUNNING
from .models import Job, utcnow
from .tenancy import bind_session, system_scope

log = logging.getLogger(__name__)

#: kind -> handler. A handler takes the session (already tenant-bound to the
#: job's org) and the job's payload, and returns a JSON-serialisable result
#: dict stashed on the job as `result_json` — the shape a caller polls for.
_HANDLERS: dict[str, Callable[[Session, dict[str, Any]], dict[str, Any]]] = {}


def register(kind: str, handler: Callable[[Session, dict[str, Any]], dict[str, Any]]) -> None:
    _HANDLERS[kind] = handler


def enqueue(
    session: Session,
    kind: str,
    payload: dict[str, Any] | None = None,
    *,
    org_id: str,
    requested_by: str = "",
    max_attempts: int = 3,
) -> Job:
    """Accept work for later. Refuses a kind with no registered handler for the
    same reason jobs.py's in-process queue does: discovering nothing knows how
    to do this an hour (or a cron cycle) later, as missing evidence instead of
    a request-time error, is the exact failure this module exists to avoid."""
    if kind not in _HANDLERS:
        raise KeyError(
            f"no handler registered for '{kind}'. Refusing to accept work that "
            "nothing knows how to do — the failure would surface later as "
            "missing evidence, not now as a clear error"
        )
    job = Job(
        kind=kind,
        payload_json=payload or {},
        max_attempts=max_attempts,
        org_id=org_id,
        requested_by=requested_by,
        enqueued_at=utcnow(),
    )
    session.add(job)
    session.flush()
    return job


def _run_one(session: Session, job: Job, *, now) -> None:
    # Caller (run_pending) has already bound the session to job.org_id.
    job.status = RUNNING
    job.attempts += 1
    session.flush()
    try:
        result = _HANDLERS[job.kind](session, job.payload_json or {})
    except Exception as exc:  # noqa: BLE001 - a job's own failure must not propagate raw
        job.last_error = f"{type(exc).__name__}: {exc}"
        log.warning("job '%s' (%s) attempt %d failed: %s", job.kind, job.id, job.attempts, job.last_error)
        log.debug("%s", traceback.format_exc())
        if job.attempts >= job.max_attempts:
            job.status = DEAD
            job.finished_at = now
        else:
            job.status = PENDING
        session.flush()
        return
    job.status = DONE
    job.result_json = result or {}
    job.finished_at = now
    session.flush()


def run_pending(session: Session, *, org_id: str | None = None, limit: int = 50) -> int:
    """Run queued work. `org_id=None` (the cron path) processes across every
    tenant present in the table — the request path always passes its own
    org_id, since a caller's request should never trigger another tenant's
    queued work. Returns how many jobs reached a terminal state (done or
    dead — a job put back to pending for another attempt doesn't count).

    Every query in this codebase against a `TenantScoped` model (`Job`
    included) is automatically restricted to the session's *bound* tenant —
    an `execute_state`-level filter (tenancy.py's `_tenant_criteria`), not
    something an explicit `.where(Job.org_id == ...)` clause here could
    override or duplicate. So finding this org's pending jobs means actually
    binding the session to it first, and finding every org's pending jobs
    (the cron path) means the one sanctioned way to see across tenants —
    `system_scope()` — not an unfiltered query the isolation layer would
    silently filter anyway.
    """
    now = utcnow()
    query = select(Job).where(Job.status == PENDING).order_by(Job.enqueued_at).limit(limit)
    if org_id is not None:
        bind_session(session, org_id)
        jobs = list(session.scalars(query))
    else:
        with system_scope("cron backstop: running pending jobs across every tenant"):
            jobs = list(session.scalars(query))
    finished = 0
    for job in jobs:
        # Re-bind per job: the cron sweep's jobs list can span several
        # tenants, and the handler's own writes (an EvidencePackage, a
        # RedTeamCampaign) must land in the job's tenant, not whichever one
        # ran immediately before it.
        bind_session(session, job.org_id)
        _run_one(session, job, now=now)
        if job.status in (DONE, DEAD):
            finished += 1
    return finished


def retry_dead(session: Session, job_id: str) -> Job | None:
    """Put one dead-lettered job back to pending, once whatever broke it has
    been fixed. Mirrors jobs.py's JobQueue.retry_dead, scoped to one job by id
    rather than by kind since a caller here is reviving a specific row they can
    see, not blind-retrying a whole category."""
    job = session.get(Job, job_id)
    if job is None or job.status != DEAD:
        return None
    job.status = PENDING
    job.attempts = 0
    job.last_error = ""
    job.finished_at = None
    session.flush()
    return job


def job_json(job: Job) -> dict[str, Any]:
    return {
        "id": job.id,
        "kind": job.kind,
        "status": job.status,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "last_error": job.last_error,
        "result": job.result_json,
        "requested_by": job.requested_by,
        "enqueued_at": job.enqueued_at.isoformat() if job.enqueued_at else None,
        "finished_at": job.finished_at.isoformat() if job.finished_at else None,
    }
