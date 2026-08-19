"""business rules

Threshold ladders and other business-process guardrails. Additive — one new table.

Revision ID: 79d6a9ac27cb
Revises: fe29ac688fe6
Create Date: 2026-08-19 16:17:06.703950
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '79d6a9ac27cb'
down_revision: str | None = 'fe29ac688fe6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('business_rules',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('key', sa.String(length=120), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('owner', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('tool', sa.String(length=160), nullable=True),
    sa.Column('field_path', sa.String(length=200), nullable=True),
    sa.Column('definition_json', sa.JSON(), nullable=False),
    sa.Column('mode', sa.String(length=16), nullable=False),
    sa.Column('enabled', sa.Boolean(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('business_rules', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_business_rules_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_business_rules_key'), ['key'], unique=False)
        batch_op.create_index(batch_op.f('ix_business_rules_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_business_rules_tool'), ['tool'], unique=False)
        batch_op.create_index('ix_business_scope', ['kind', 'tool', 'field_path'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('business_rules', schema=None) as batch_op:
        batch_op.drop_index('ix_business_scope')
        batch_op.drop_index(batch_op.f('ix_business_rules_tool'))
        batch_op.drop_index(batch_op.f('ix_business_rules_org_id'))
        batch_op.drop_index(batch_op.f('ix_business_rules_key'))
        batch_op.drop_index(batch_op.f('ix_business_rules_agent_id'))

    op.drop_table('business_rules')
