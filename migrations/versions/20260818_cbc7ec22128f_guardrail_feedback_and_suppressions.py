"""guardrail feedback and suppressions

P3-14. Additive only — two new tables, nothing existing is altered, so this is safe
to apply to a live deployment without a maintenance window.

Revision ID: cbc7ec22128f
Revises: b46abcc54a13
Create Date: 2026-08-18 20:06:11.904728
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'cbc7ec22128f'
down_revision: str | None = 'b46abcc54a13'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('guardrail_feedback',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('decision_id', sa.String(length=40), nullable=True),
    sa.Column('trace_id', sa.String(length=40), nullable=True),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('detector_key', sa.String(length=64), nullable=True),
    sa.Column('entity_type', sa.String(length=64), nullable=True),
    sa.Column('label', sa.String(length=24), nullable=False),
    sa.Column('score', sa.Float(), nullable=False),
    sa.Column('verdict', sa.String(length=16), nullable=True),
    sa.Column('note', sa.Text(), nullable=False),
    sa.Column('actor', sa.String(length=200), nullable=True),
    sa.Column('status', sa.String(length=24), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('guardrail_feedback', schema=None) as batch_op:
        batch_op.create_index('ix_feedback_detector', ['detector_key', 'label'], unique=False)
        batch_op.create_index(batch_op.f('ix_guardrail_feedback_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_guardrail_feedback_decision_id'), ['decision_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_guardrail_feedback_label'), ['label'], unique=False)
        batch_op.create_index(batch_op.f('ix_guardrail_feedback_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_guardrail_feedback_trace_id'), ['trace_id'], unique=False)

    op.create_table('suppressions',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('feedback_id', sa.String(length=40), nullable=True),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('detector_key', sa.String(length=64), nullable=False),
    sa.Column('entity_type', sa.String(length=64), nullable=True),
    sa.Column('sample_hash', sa.String(length=64), nullable=True),
    sa.Column('surface', sa.String(length=24), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('hits', sa.Integer(), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('suppressions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_suppressions_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_suppressions_expires_at'), ['expires_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_suppressions_org_id'), ['org_id'], unique=False)
        batch_op.create_index('ix_suppressions_scope', ['agent_id', 'detector_key', 'entity_type'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('suppressions', schema=None) as batch_op:
        batch_op.drop_index('ix_suppressions_scope')
        batch_op.drop_index(batch_op.f('ix_suppressions_org_id'))
        batch_op.drop_index(batch_op.f('ix_suppressions_expires_at'))
        batch_op.drop_index(batch_op.f('ix_suppressions_agent_id'))

    op.drop_table('suppressions')
    with op.batch_alter_table('guardrail_feedback', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_guardrail_feedback_trace_id'))
        batch_op.drop_index(batch_op.f('ix_guardrail_feedback_org_id'))
        batch_op.drop_index(batch_op.f('ix_guardrail_feedback_label'))
        batch_op.drop_index(batch_op.f('ix_guardrail_feedback_decision_id'))
        batch_op.drop_index(batch_op.f('ix_guardrail_feedback_agent_id'))
        batch_op.drop_index('ix_feedback_detector')

    op.drop_table('guardrail_feedback')
