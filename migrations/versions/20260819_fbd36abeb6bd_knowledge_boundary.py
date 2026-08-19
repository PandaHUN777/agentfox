"""knowledge boundary

P7. Additive only — one new table.

Revision ID: fbd36abeb6bd
Revises: 53109d2c5639
Create Date: 2026-08-19 07:44:33.283564
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'fbd36abeb6bd'
down_revision: str | None = '53109d2c5639'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('knowledge_boundaries',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('systems_of_record', sa.JSON(), nullable=False),
    sa.Column('coverage_months', sa.Integer(), nullable=True),
    sa.Column('coverage_start', sa.Date(), nullable=True),
    sa.Column('entity_types', sa.JSON(), nullable=False),
    sa.Column('answerable_types', sa.JSON(), nullable=False),
    sa.Column('out_of_scope_topics', sa.JSON(), nullable=False),
    sa.Column('freshness_hours', sa.Integer(), nullable=True),
    sa.Column('mode', sa.String(length=16), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('knowledge_boundaries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_knowledge_boundaries_agent_id'), ['agent_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_knowledge_boundaries_org_id'), ['org_id'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('knowledge_boundaries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_knowledge_boundaries_org_id'))
        batch_op.drop_index(batch_op.f('ix_knowledge_boundaries_agent_id'))

    op.drop_table('knowledge_boundaries')
