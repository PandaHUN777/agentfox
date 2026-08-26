"""policy canary rollout

Adds policy_canaries (P12-6) — agent canary rollout by version, with health
gates and automated rollback. A canary sits on top of the current binding
rather than replacing it: stable_version_id is what the binding already
points at, candidate_version_id is the version being tried, and percent
tracks how much live traffic is currently being routed to the candidate.
Additive only.

Revision ID: a1b2c3d4e5f6
Revises: 389c6fd36296
Create Date: 2026-08-27 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: str | None = '389c6fd36296'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('policy_canaries',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('policy_id', sa.String(length=40), nullable=False),
    sa.Column('stable_version_id', sa.String(length=40), nullable=False),
    sa.Column('candidate_version_id', sa.String(length=40), nullable=False),
    sa.Column('steps', sa.JSON(), nullable=False),
    sa.Column('step_index', sa.Integer(), nullable=False),
    sa.Column('percent', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('max_block_rate_delta', sa.Float(), nullable=False),
    sa.Column('min_sample', sa.Integer(), nullable=False),
    sa.Column('started_by', sa.String(length=120), nullable=True),
    sa.Column('rollback_reason', sa.Text(), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('policy_canaries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_policy_canaries_policy_id'), ['policy_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_policy_canaries_status'), ['status'], unique=False)
        batch_op.create_index(batch_op.f('ix_policy_canaries_org_id'), ['org_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('policy_canaries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_policy_canaries_org_id'))
        batch_op.drop_index(batch_op.f('ix_policy_canaries_status'))
        batch_op.drop_index(batch_op.f('ix_policy_canaries_policy_id'))
    op.drop_table('policy_canaries')
