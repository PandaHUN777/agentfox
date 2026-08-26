"""inter-agent message security

Adds agent_signing_keys (one HMAC secret per agent, encrypted at rest) and
agent_message_log (NOM-IAM-08, closes OWASP ASI07) — the anti-replay table for
inter-agent traffic, unique on (org, sender, nonce) so a repeated message fails
to insert rather than needing a second replay-detection mechanism. Additive
only.

Revision ID: 389c6fd36296
Revises: e8ccd382d2b9
Create Date: 2026-08-26 00:00:01.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '389c6fd36296'
down_revision: str | None = 'e8ccd382d2b9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('agent_signing_keys',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=False),
    sa.Column('key_encrypted', sa.Text(), nullable=False),
    sa.Column('created_by', sa.String(length=200), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('agent_signing_keys', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_agent_signing_keys_agent_id'), ['agent_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_agent_signing_keys_org_id'), ['org_id'], unique=False)

    op.create_table('agent_message_log',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('sender_slug', sa.String(length=120), nullable=False),
    sa.Column('recipient_slug', sa.String(length=120), nullable=True),
    sa.Column('nonce', sa.String(length=64), nullable=False),
    sa.Column('signed', sa.Boolean(), nullable=False),
    sa.Column('signature_valid', sa.Boolean(), nullable=True),
    sa.Column('agent_card_match', sa.Boolean(), nullable=False),
    sa.Column('decision_id', sa.String(length=40), nullable=True),
    sa.Column('trace_id', sa.String(length=40), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('org_id', 'sender_slug', 'nonce', name='ux_agent_message_sender_nonce')
    )
    with op.batch_alter_table('agent_message_log', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_agent_message_log_sender_slug'), ['sender_slug'], unique=False)
        batch_op.create_index(batch_op.f('ix_agent_message_log_trace_id'), ['trace_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_agent_message_log_org_id'), ['org_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('agent_message_log', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_agent_message_log_org_id'))
        batch_op.drop_index(batch_op.f('ix_agent_message_log_trace_id'))
        batch_op.drop_index(batch_op.f('ix_agent_message_log_sender_slug'))
    op.drop_table('agent_message_log')

    with op.batch_alter_table('agent_signing_keys', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_agent_signing_keys_org_id'))
        batch_op.drop_index(batch_op.f('ix_agent_signing_keys_agent_id'))
    op.drop_table('agent_signing_keys')
