"""source connections

Adds source_connections: a real way to validate a source that is an enterprise
knowledge base or a customer's own database, not just a fetchable URL. A
`database` connection holds dialect/host/port/database/username structured
(password encrypted); an `api` connection holds a base URL and auth header name
(token encrypted) — the shape Confluence, SharePoint, Notion and similar
enterprise KBs share under the hood. Additive only.

Revision ID: d1e2f3a4b5c6
Revises: c8f4a17e9b52
Create Date: 2026-08-25 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'd1e2f3a4b5c6'
down_revision: str | None = 'c8f4a17e9b52'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('source_connections',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('source_key', sa.String(length=500), nullable=False),
    sa.Column('kind', sa.String(length=16), nullable=False),
    sa.Column('config_json', sa.JSON(), nullable=False),
    sa.Column('credential_encrypted', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('org_id', 'source_key', name='ux_source_connections_org_key')
    )
    with op.batch_alter_table('source_connections', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_source_connections_source_key'), ['source_key'], unique=False)
        batch_op.create_index(batch_op.f('ix_source_connections_org_id'), ['org_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('source_connections', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_source_connections_org_id'))
        batch_op.drop_index(batch_op.f('ix_source_connections_source_key'))
    op.drop_table('source_connections')
