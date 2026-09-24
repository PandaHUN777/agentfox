"""improvement loop foundations (governed self-improvement, Phase 0)

Adds the data contract every Phase 0 workstream builds on:

- `change_proposals`: a proposed change to any configuration object, with its
  evidence, proof bundle, direction, autonomy level and lifecycle.
- `job_schedules`: recurring per-tenant work; the cron drains, this fills.
- `findings.fingerprint/occurrences/last_seen_at`: one finding per recurring problem.
- `guardrail_feedback` index on (decision_id, actor): one label per decision per person,
  enforced in application code (a unique constraint would fail on existing duplicates).
- `jobs.available_at/started_at/schedule_id`: backoff and stuck-job recovery.
- `policy_canaries.max_block_rate_drop/min_dwell_seconds/last_advanced_at`: a two-way
  health gate, so a candidate that quietly blocks less is rolled back too.

Purely additive, and re-runnable: every object is created only if it is missing, because
`init_db()`'s create_all can leave a database holding this revision's tables while its
recorded revision is still the previous one.

Revision ID: d5e2a9c14f03
Revises: b3f8e29a71c4
Create Date: 2026-09-16 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5e2a9c14f03"
down_revision: str | None = "b3f8e29a71c4"

#: Frozen copy of models.PROPOSAL_OPEN_FINGERPRINT as of this revision.
_OPEN_FINGERPRINT = (
    "fingerprint IS NOT NULL AND status IN ('proposed', 'proven', 'approved', 'canary', 'applied')"
)
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Idempotence helpers.
#
# `init_db()` calls create_all and then stamps the head, so a database that was
# first created by a *newer* build already has this revision's tables while its
# alembic_version still points at the previous one. Plain create_table then fails
# with "table already exists" and `agentfox db upgrade` dies on a database that is
# not actually broken — which is exactly what happened to the hosted deployment and
# to local dev databases. Creating only what is missing costs one inspector call
# and makes the upgrade re-runnable.
# ---------------------------------------------------------------------------


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return any(c["name"] == column for c in _inspector().get_columns(table))


def _has_index(table: str, index: str) -> bool:
    return any(i["name"] == index for i in _inspector().get_indexes(table))


def upgrade() -> None:
    if not _has_table("change_proposals"):
        op.create_table(
            "change_proposals",
            sa.Column("id", sa.String(length=40), nullable=False),
            sa.Column("kind", sa.String(length=48), nullable=False),
            sa.Column("source", sa.String(length=64), nullable=False),
            sa.Column("target_type", sa.String(length=32), nullable=False),
            sa.Column("target_ref", sa.String(length=200), nullable=False),
            sa.Column("scope_level", sa.String(length=16), nullable=False),
            sa.Column("scope_id", sa.String(length=200), nullable=False),
            sa.Column("title", sa.String(length=300), nullable=False),
            sa.Column("rationale", sa.Text(), nullable=False),
            sa.Column("direction", sa.String(length=16), nullable=False),
            sa.Column("autonomy_level", sa.String(length=4), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False),
            sa.Column("fingerprint", sa.String(length=64), nullable=True),
            sa.Column("diff_json", sa.JSON(), nullable=False),
            sa.Column("evidence_json", sa.JSON(), nullable=False),
            sa.Column("proof_json", sa.JSON(), nullable=False),
            sa.Column("expected_effect_json", sa.JSON(), nullable=False),
            sa.Column("related_finding_ids", sa.JSON(), nullable=False),
            sa.Column("proposed_by", sa.String(length=120), nullable=False),
            sa.Column("decided_by", sa.String(length=120), nullable=True),
            sa.Column("second_approver", sa.String(length=120), nullable=True),
            sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("decision_note", sa.Text(), nullable=False),
            sa.Column("applied_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("rolled_back_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("outcome_note", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("org_id", sa.String(length=64), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    with op.batch_alter_table("change_proposals", schema=None) as batch_op:
        for name, columns in (
            ("ix_change_proposals_kind", ["kind"]),
            ("ix_change_proposals_status", ["status"]),
            ("ix_change_proposals_fingerprint", ["fingerprint"]),
            ("ix_change_proposals_org_id", ["org_id"]),
            ("ix_proposals_status_created", ["status", "created_at"]),
        ):
            if not _has_index("change_proposals", name):
                batch_op.create_index(name, columns, unique=False)
        if not _has_index("change_proposals", "ux_proposals_open_fingerprint"):
            batch_op.create_index(
                "ux_proposals_open_fingerprint",
                ["org_id", "fingerprint"],
                unique=True,
                sqlite_where=sa.text(_OPEN_FINGERPRINT),
                postgresql_where=sa.text(_OPEN_FINGERPRINT),
            )

    if not _has_table("job_schedules"):
        op.create_table(
            "job_schedules",
            sa.Column("id", sa.String(length=40), nullable=False),
            sa.Column("kind", sa.String(length=64), nullable=False),
            sa.Column("payload_json", sa.JSON(), nullable=False),
            sa.Column("interval_seconds", sa.Integer(), nullable=False),
            sa.Column("enabled", sa.Boolean(), nullable=False),
            sa.Column("last_enqueued_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("next_due_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_by", sa.String(length=120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("org_id", sa.String(length=64), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )
    with op.batch_alter_table("job_schedules", schema=None) as batch_op:
        for name, columns in (
            ("ix_job_schedules_kind", ["kind"]),
            ("ix_job_schedules_next_due_at", ["next_due_at"]),
            ("ix_job_schedules_org_id", ["org_id"]),
        ):
            if not _has_index("job_schedules", name):
                batch_op.create_index(name, columns, unique=False)

    with op.batch_alter_table("findings", schema=None) as batch_op:
        for column in (
            sa.Column("fingerprint", sa.String(length=64), nullable=True),
            sa.Column("occurrences", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        ):
            if not _has_column("findings", column.name):
                batch_op.add_column(column)
        if not _has_index("findings", "ix_findings_fingerprint"):
            batch_op.create_index("ix_findings_fingerprint", ["fingerprint"], unique=False)

    with op.batch_alter_table("guardrail_feedback", schema=None) as batch_op:
        if not _has_index("guardrail_feedback", "ix_feedback_decision_actor"):
            batch_op.create_index(
                "ix_feedback_decision_actor", ["decision_id", "actor"], unique=False
            )

    with op.batch_alter_table("jobs", schema=None) as batch_op:
        for column in (
            sa.Column("available_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("schedule_id", sa.String(length=40), nullable=True),
        ):
            if not _has_column("jobs", column.name):
                batch_op.add_column(column)
        if not _has_index("jobs", "ix_jobs_schedule_id"):
            batch_op.create_index("ix_jobs_schedule_id", ["schedule_id"], unique=False)

    with op.batch_alter_table("policy_canaries", schema=None) as batch_op:
        for column in (
            sa.Column(
                "max_block_rate_drop", sa.Float(), nullable=False, server_default=sa.text("0.15")
            ),
            sa.Column(
                "min_dwell_seconds", sa.Integer(), nullable=False, server_default=sa.text("0")
            ),
            sa.Column("last_advanced_at", sa.DateTime(timezone=True), nullable=True),
        ):
            if not _has_column("policy_canaries", column.name):
                batch_op.add_column(column)


def downgrade() -> None:
    with op.batch_alter_table("policy_canaries", schema=None) as batch_op:
        batch_op.drop_column("last_advanced_at")
        batch_op.drop_column("min_dwell_seconds")
        batch_op.drop_column("max_block_rate_drop")

    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_jobs_schedule_id"))
        batch_op.drop_column("schedule_id")
        batch_op.drop_column("started_at")
        batch_op.drop_column("available_at")

    with op.batch_alter_table("guardrail_feedback", schema=None) as batch_op:
        batch_op.drop_index("ix_feedback_decision_actor")

    with op.batch_alter_table("findings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_findings_fingerprint"))
        batch_op.drop_column("last_seen_at")
        batch_op.drop_column("occurrences")
        batch_op.drop_column("fingerprint")

    with op.batch_alter_table("job_schedules", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_job_schedules_org_id"))
        batch_op.drop_index(batch_op.f("ix_job_schedules_next_due_at"))
        batch_op.drop_index(batch_op.f("ix_job_schedules_kind"))
    op.drop_table("job_schedules")

    with op.batch_alter_table("change_proposals", schema=None) as batch_op:
        batch_op.drop_index("ux_proposals_open_fingerprint")
        batch_op.drop_index("ix_proposals_status_created")
        batch_op.drop_index(batch_op.f("ix_change_proposals_org_id"))
        batch_op.drop_index(batch_op.f("ix_change_proposals_fingerprint"))
        batch_op.drop_index(batch_op.f("ix_change_proposals_status"))
        batch_op.drop_index(batch_op.f("ix_change_proposals_kind"))
    op.drop_table("change_proposals")
