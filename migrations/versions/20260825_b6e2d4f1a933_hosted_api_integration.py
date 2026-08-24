"""hosted api integration

Adds the second onboarding path alongside the GitHub repo scan: a team points at a
hosted API endpoint plus its OpenAPI spec/docs instead of handing over source access.
`agents` gets endpoint_url/docs_url/openapi_spec_url; `scan_runs` gets source_kind
("github"|"hosted_api") and target_url, and connection_id becomes nullable since a
hosted-API scan has no stored GitHub connection to point at. Additive only.

Revision ID: b6e2d4f1a933
Revises: a3f7c9e1b204
Create Date: 2026-08-25 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b6e2d4f1a933'
down_revision: str | None = 'a3f7c9e1b204'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('endpoint_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('docs_url', sa.String(length=500), nullable=True))
        batch_op.add_column(sa.Column('openapi_spec_url', sa.String(length=500), nullable=True))

    with op.batch_alter_table('scan_runs', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('source_kind', sa.String(length=16), nullable=False, server_default='github')
        )
        batch_op.add_column(sa.Column('target_url', sa.String(length=500), nullable=True))
        batch_op.alter_column('source_kind', server_default=None)
        batch_op.alter_column('connection_id', existing_type=sa.String(length=40), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('scan_runs', schema=None) as batch_op:
        batch_op.alter_column('connection_id', existing_type=sa.String(length=40), nullable=False)
        batch_op.drop_column('target_url')
        batch_op.drop_column('source_kind')

    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_column('openapi_spec_url')
        batch_op.drop_column('docs_url')
        batch_op.drop_column('endpoint_url')
