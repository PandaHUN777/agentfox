"""memory write governance

Adds memory_entries (NOM-RTG-13, closes OWASP ASI06): a write into whatever an
agent uses as long-term memory now has somewhere to be recorded with taint
source, provenance and an expiry that defaults closed until a human or trusted
process verifies the entry. Additive only.

Revision ID: e8ccd382d2b9
Revises: e2f3a4b5c6d7
Create Date: 2026-08-26 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e8ccd382d2b9'
down_revision: str | None = 'e2f3a4b5c6d7'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('memory_entries',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('subject', sa.String(length=200), nullable=True),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('taint_source', sa.String(length=32), nullable=False),
    sa.Column('provenance', sa.JSON(), nullable=False),
    sa.Column('decision_id', sa.String(length=40), nullable=True),
    sa.Column('verified_by', sa.String(length=200), nullable=True),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('memory_entries', schema=None) as batch_op:
        batch_op.create_index('ix_memory_entries_scope', ['agent_id', 'subject'], unique=False)
        batch_op.create_index(batch_op.f('ix_memory_entries_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_memory_entries_expires_at'), ['expires_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_memory_entries_org_id'), ['org_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('memory_entries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_memory_entries_org_id'))
        batch_op.drop_index(batch_op.f('ix_memory_entries_expires_at'))
        batch_op.drop_index(batch_op.f('ix_memory_entries_agent_id'))
        batch_op.drop_index('ix_memory_entries_scope')
    op.drop_table('memory_entries')
