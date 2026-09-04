"""deferred job queue (PL-5)

Adds `jobs`, the persisted backend for jobs.py's enqueue/run/retry/dead-letter
interface. Wired into evidence-package export and red-team-campaign runs —
both now enqueue through this table and are processed within the same request
(immediate retry on a transient failure, a real dead-letter row instead of a
bare 500 on permanent failure), with a cron-triggered endpoint as a backstop
for anything that gets stuck in "running" after a crashed/timed-out request.
Purely additive.

Revision ID: b3f8e29a71c4
Revises: a2a6d7619187
Create Date: 2026-09-04 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3f8e29a71c4"
down_revision: str | None = "a2a6d7619187"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("result_json", sa.JSON(), nullable=False),
        sa.Column("requested_by", sa.String(length=120), nullable=False),
        sa.Column("enqueued_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_jobs_kind"), ["kind"], unique=False)
        batch_op.create_index(batch_op.f("ix_jobs_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_jobs_org_id"), ["org_id"], unique=False)
        batch_op.create_index("ix_jobs_status_enqueued", ["status", "enqueued_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.drop_index("ix_jobs_status_enqueued")
        batch_op.drop_index(batch_op.f("ix_jobs_org_id"))
        batch_op.drop_index(batch_op.f("ix_jobs_status"))
        batch_op.drop_index(batch_op.f("ix_jobs_kind"))
    op.drop_table("jobs")
