"""source content validation

Adds content_hash/last_validated_at/last_validation_status to source_records — the
difference between "this source is tiered" (a human's claim) and "we actually
fetched it and checked" (a verified fact). Additive only.

Revision ID: c8f4a17e9b52
Revises: b6e2d4f1a933
Create Date: 2026-08-25 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'c8f4a17e9b52'
down_revision: str | None = 'b6e2d4f1a933'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('source_records', schema=None) as batch_op:
        batch_op.add_column(sa.Column('content_hash', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('last_validated_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('last_validation_status', sa.String(length=24), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('source_records', schema=None) as batch_op:
        batch_op.drop_column('last_validation_status')
        batch_op.drop_column('last_validated_at')
        batch_op.drop_column('content_hash')
