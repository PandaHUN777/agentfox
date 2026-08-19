"""escalation policy, handoffs and conversation turns

P11. Additive only — three new tables, nothing existing is altered.

Revision ID: 53109d2c5639
Revises: cbc7ec22128f
Create Date: 2026-08-19 07:32:00.018152
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '53109d2c5639'
down_revision: str | None = 'cbc7ec22128f'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('conversation_turns',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('session_id', sa.String(length=120), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('trace_id', sa.String(length=40), nullable=True),
    sa.Column('turn_index', sa.Integer(), nullable=False),
    sa.Column('user_text', sa.Text(), nullable=False),
    sa.Column('agent_text', sa.Text(), nullable=False),
    sa.Column('signals_json', sa.JSON(), nullable=False),
    sa.Column('resolved_claimed', sa.Boolean(), nullable=False),
    sa.Column('escalated', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('conversation_turns', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_conversation_turns_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_conversation_turns_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_conversation_turns_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_conversation_turns_trace_id'), ['trace_id'], unique=False)
        batch_op.create_index('ix_turns_session_index', ['session_id', 'turn_index'], unique=False)

    op.create_table('escalation_policies',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('conditions_json', sa.JSON(), nullable=False),
    sa.Column('owner_role', sa.String(length=64), nullable=False),
    sa.Column('sla_minutes', sa.Integer(), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('mode', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('escalation_policies', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_escalation_policies_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_escalation_policies_org_id'), ['org_id'], unique=False)

    op.create_table('handoffs',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('trace_id', sa.String(length=40), nullable=True),
    sa.Column('session_id', sa.String(length=120), nullable=True),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('triggers_json', sa.JSON(), nullable=False),
    sa.Column('context_json', sa.JSON(), nullable=False),
    sa.Column('completeness', sa.Float(), nullable=False),
    sa.Column('owner_role', sa.String(length=64), nullable=False),
    sa.Column('owner_user_id', sa.String(length=40), nullable=True),
    sa.Column('due_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('detected_retroactively', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('handoffs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_handoffs_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_handoffs_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_handoffs_session_id'), ['session_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_handoffs_status'), ['status'], unique=False)
        batch_op.create_index('ix_handoffs_status_due', ['status', 'due_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_handoffs_trace_id'), ['trace_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('handoffs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_handoffs_trace_id'))
        batch_op.drop_index('ix_handoffs_status_due')
        batch_op.drop_index(batch_op.f('ix_handoffs_status'))
        batch_op.drop_index(batch_op.f('ix_handoffs_session_id'))
        batch_op.drop_index(batch_op.f('ix_handoffs_org_id'))
        batch_op.drop_index(batch_op.f('ix_handoffs_agent_id'))

    op.drop_table('handoffs')
    with op.batch_alter_table('escalation_policies', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_escalation_policies_org_id'))
        batch_op.drop_index(batch_op.f('ix_escalation_policies_agent_id'))

    op.drop_table('escalation_policies')
    with op.batch_alter_table('conversation_turns', schema=None) as batch_op:
        batch_op.drop_index('ix_turns_session_index')
        batch_op.drop_index(batch_op.f('ix_conversation_turns_trace_id'))
        batch_op.drop_index(batch_op.f('ix_conversation_turns_session_id'))
        batch_op.drop_index(batch_op.f('ix_conversation_turns_org_id'))
        batch_op.drop_index(batch_op.f('ix_conversation_turns_agent_id'))

    op.drop_table('conversation_turns')
