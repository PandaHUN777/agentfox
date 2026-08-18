"""trace links for observability correlation

I-4 / I-6. Additive only: a new table, no changes to existing ones, so this upgrade
is safe to run against a live deployment without a maintenance window.

Revision ID: b46abcc54a13
Revises: b87fa49f9b09
Create Date: 2026-08-18 19:55:03.484845
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b46abcc54a13'
down_revision: str | None = 'b87fa49f9b09'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('trace_links',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('trace_id', sa.String(length=40), nullable=False),
    sa.Column('system', sa.String(length=32), nullable=False),
    sa.Column('external_trace_id', sa.String(length=200), nullable=False),
    sa.Column('external_run_id', sa.String(length=200), nullable=True),
    sa.Column('project', sa.String(length=200), nullable=True),
    sa.Column('url', sa.Text(), nullable=True),
    sa.Column('direction', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('trace_links', schema=None) as batch_op:
        batch_op.create_index('ix_trace_links_external', ['system', 'external_trace_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_trace_links_org_id'), ['org_id'], unique=False)
        batch_op.create_index('ix_trace_links_run', ['system', 'external_run_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_trace_links_trace_id'), ['trace_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('trace_links', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_trace_links_trace_id'))
        batch_op.drop_index('ix_trace_links_run')
        batch_op.drop_index(batch_op.f('ix_trace_links_org_id'))
        batch_op.drop_index('ix_trace_links_external')

    op.drop_table('trace_links')
