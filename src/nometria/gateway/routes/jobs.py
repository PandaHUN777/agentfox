"""Deferred job queue observability + cron backstop (PL-5).

Evidence-package export and red-team-campaign runs enqueue and process within
the same request that creates them (see `jobs_db.py`'s own module docstring
for why, not a design accident). What these routes add is the part that
same-request processing can't give a caller on its own: a durable, queryable
record of every attempt — including one that's dead-lettered, or one stuck in
`running` because the request that started it never got to finish.
"""

from __future__ import annotations

import secrets
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ... import jobs_db
from ...config import get_settings
from ...models import Job, User
from ...tenancy import session_org
from ..deps import current_user, db, require

router = APIRouter(prefix="/api", tags=["jobs"])


@router.get("/jobs")
def list_jobs(
    kind: str | None = None,
    status: str | None = None,
    limit: int = 50,
    session: Session = Depends(db),
    _user: User = Depends(current_user),
) -> dict[str, Any]:
    """Includes dead-lettered jobs by default — that's the point (jobs.py's
    own docstring: the dead letter is public state, not a log line an
    operator has to know to go look for)."""
    query = (
        select(Job)
        .where(Job.org_id == session_org(session))
        .order_by(Job.enqueued_at.desc())
        .limit(limit)
    )
    if kind:
        query = query.where(Job.kind == kind)
    if status:
        query = query.where(Job.status == status)
    return {"jobs": [jobs_db.job_json(j) for j in session.scalars(query)]}


@router.get("/jobs/{job_id}")
def get_job(
    job_id: str, session: Session = Depends(db), _user: User = Depends(current_user)
) -> dict[str, Any]:
    job = session.get(Job, job_id)
    if job is None or job.org_id != session_org(session):
        raise HTTPException(404, "unknown job")
    return jobs_db.job_json(job)


@router.post("/jobs/{job_id}/retry")
def retry_job(
    job_id: str, session: Session = Depends(db), _user: User = Depends(require("jobs"))
) -> dict[str, Any]:
    job = session.get(Job, job_id)
    if job is None or job.org_id != session_org(session):
        raise HTTPException(404, "unknown job")
    revived = jobs_db.retry_dead(session, job_id)
    if revived is None:
        raise HTTPException(409, f"job is '{job.status}', not 'dead' — nothing to retry")
    jobs_db.run_pending(session, org_id=revived.org_id, limit=1)
    session.refresh(revived)
    return jobs_db.job_json(revived)


def _require_cron_secret(
    authorization: Annotated[str | None, Header()] = None,
) -> None:
    expected = get_settings().cron_secret
    if not expected:
        raise HTTPException(503, "cron_secret is not configured — this endpoint is disabled")
    given = (authorization or "").removeprefix("Bearer ").strip()
    if not given or not secrets.compare_digest(given, expected):
        raise HTTPException(401, "invalid or missing cron secret")


@router.post("/internal/jobs/run", dependencies=[Depends(_require_cron_secret)])
def run_pending_jobs(limit: int = 50, session: Session = Depends(db)) -> dict[str, Any]:
    """The cron backstop. `org_id=None` processes across every tenant with
    pending work — the one place that's correct, since nothing about a cron
    trigger belongs to a single tenant's request."""
    finished = jobs_db.run_pending(session, org_id=None, limit=limit)
    return {"processed": finished}
