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

Purely additive. New NOT NULL columns on existing tables carry server defaults.

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
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
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
        batch_op.create_index(batch_op.f("ix_change_proposals_kind"), ["kind"], unique=False)
        batch_op.create_index(batch_op.f("ix_change_proposals_status"), ["status"], unique=False)
        batch_op.create_index(batch_op.f("ix_change_proposals_fingerprint"), ["fingerprint"], unique=False)
        batch_op.create_index(batch_op.f("ix_change_proposals_org_id"), ["org_id"], unique=False)
        batch_op.create_index("ix_proposals_status_created", ["status", "created_at"], unique=False)

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
        batch_op.create_index(batch_op.f("ix_job_schedules_kind"), ["kind"], unique=False)
        batch_op.create_index(batch_op.f("ix_job_schedules_next_due_at"), ["next_due_at"], unique=False)
        batch_op.create_index(batch_op.f("ix_job_schedules_org_id"), ["org_id"], unique=False)

    with op.batch_alter_table("findings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("fingerprint", sa.String(length=64), nullable=True))
        batch_op.add_column(
            sa.Column("occurrences", sa.Integer(), nullable=False, server_default=sa.text("1"))
        )
        batch_op.add_column(sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_index(batch_op.f("ix_findings_fingerprint"), ["fingerprint"], unique=False)

    with op.batch_alter_table("guardrail_feedback", schema=None) as batch_op:
        batch_op.create_index("ix_feedback_decision_actor", ["decision_id", "actor"], unique=False)

    with op.batch_alter_table("jobs", schema=None) as batch_op:
        batch_op.add_column(sa.Column("available_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("schedule_id", sa.String(length=40), nullable=True))
        batch_op.create_index(batch_op.f("ix_jobs_schedule_id"), ["schedule_id"], unique=False)

    with op.batch_alter_table("policy_canaries", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "max_block_rate_drop", sa.Float(), nullable=False, server_default=sa.text("0.15")
            )
        )
        batch_op.add_column(
            sa.Column("min_dwell_seconds", sa.Integer(), nullable=False, server_default=sa.text("0"))
        )
        batch_op.add_column(
            sa.Column("last_advanced_at", sa.DateTime(timezone=True), nullable=True)
        )


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
        batch_op.drop_index("ix_proposals_status_created")
        batch_op.drop_index(batch_op.f("ix_change_proposals_org_id"))
        batch_op.drop_index(batch_op.f("ix_change_proposals_fingerprint"))
        batch_op.drop_index(batch_op.f("ix_change_proposals_status"))
        batch_op.drop_index(batch_op.f("ix_change_proposals_kind"))
    op.drop_table("change_proposals")
