"""source records

P8. Additive only — one new table.

Revision ID: 5aeb5ff1a175
Revises: fbd36abeb6bd
Create Date: 2026-08-19 07:57:23.506961
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '5aeb5ff1a175'
down_revision: str | None = 'fbd36abeb6bd'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('source_records',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('key', sa.String(length=500), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('tier', sa.String(length=24), nullable=False),
    sa.Column('owner', sa.String(length=200), nullable=True),
    sa.Column('domain', sa.String(length=120), nullable=True),
    sa.Column('updated_at_source', sa.DateTime(timezone=True), nullable=True),
    sa.Column('freshness_sla_hours', sa.Integer(), nullable=True),
    sa.Column('deprecated', sa.Boolean(), nullable=False),
    sa.Column('metadata_json', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('source_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_source_records_domain'), ['domain'], unique=False)
        batch_op.create_index(batch_op.f('ix_source_records_key'), ['key'], unique=True)
        batch_op.create_index(batch_op.f('ix_source_records_org_id'), ['org_id'], unique=False)
        batch_op.create_index('ix_sources_tier', ['tier', 'domain'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('source_records', schema=None) as batch_op:
        batch_op.drop_index('ix_sources_tier')
        batch_op.drop_index(batch_op.f('ix_source_records_org_id'))
        batch_op.drop_index(batch_op.f('ix_source_records_key'))
        batch_op.drop_index(batch_op.f('ix_source_records_domain'))

    op.drop_table('source_records')
