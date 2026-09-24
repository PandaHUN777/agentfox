"""seed data flag

Adds is_seed to agents and source_records — a UX audit found seed/demo data from
`agentfox seed` was indistinguishable from real records anywhere in the UI, which a
real customer could mistake for their own data. Additive only.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-08-25 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'e2f3a4b5c6d7'
down_revision: str | None = 'd1e2f3a4b5c6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_seed', sa.Boolean(), nullable=False, server_default=sa.false())
        )
    with op.batch_alter_table('source_records', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_seed', sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table('source_records', schema=None) as batch_op:
        batch_op.drop_column('is_seed')
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('is_seed')
