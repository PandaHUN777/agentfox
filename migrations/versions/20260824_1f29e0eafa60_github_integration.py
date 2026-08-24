"""github integration

Adds the "connect your repo" flow: a stored (encrypted) GitHub OAuth grant per org,
scan runs against it, and provenance/draft fields on Agent and Policy so a repo scan
can propose agents and policies for human review rather than creating them live.
Additive only.

Revision ID: 1f29e0eafa60
Revises: 79d6a9ac27cb
Create Date: 2026-08-24 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '1f29e0eafa60'
down_revision: str | None = '79d6a9ac27cb'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('github_connections',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('github_user_id', sa.String(length=64), nullable=False),
    sa.Column('github_login', sa.String(length=200), nullable=False),
    sa.Column('access_token_encrypted', sa.Text(), nullable=False),
    sa.Column('connected_by_user_id', sa.String(length=40), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.ForeignKeyConstraint(['connected_by_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('github_connections', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_github_connections_github_user_id'), ['github_user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_github_connections_org_id'), ['org_id'], unique=False)

    op.create_table('scan_runs',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('connection_id', sa.String(length=40), nullable=False),
    sa.Column('repo_full_name', sa.String(length=300), nullable=False),
    sa.Column('ref', sa.String(length=120), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('summary_json', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.ForeignKeyConstraint(['connection_id'], ['github_connections.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('scan_runs', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_scan_runs_connection_id'), ['connection_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_scan_runs_org_id'), ['org_id'], unique=False)

    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.add_column(sa.Column('source_scan_run_id', sa.String(length=40), nullable=True))
        batch_op.create_index(batch_op.f('ix_agents_source_scan_run_id'), ['source_scan_run_id'], unique=False)
        batch_op.create_foreign_key('fk_agents_source_scan_run_id', 'scan_runs', ['source_scan_run_id'], ['id'])

    with op.batch_alter_table('policies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('proposed', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('source_scan_run_id', sa.String(length=40), nullable=True))
        batch_op.create_index(batch_op.f('ix_policies_source_scan_run_id'), ['source_scan_run_id'], unique=False)
        batch_op.create_foreign_key('fk_policies_source_scan_run_id', 'scan_runs', ['source_scan_run_id'], ['id'])
        batch_op.alter_column('proposed', server_default=None)


def downgrade() -> None:
    with op.batch_alter_table('policies', schema=None) as batch_op:
        batch_op.drop_constraint('fk_policies_source_scan_run_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_policies_source_scan_run_id'))
        batch_op.drop_column('source_scan_run_id')
        batch_op.drop_column('proposed')

    with op.batch_alter_table('agents', schema=None) as batch_op:
        batch_op.drop_constraint('fk_agents_source_scan_run_id', type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_agents_source_scan_run_id'))
        batch_op.drop_column('source_scan_run_id')

    with op.batch_alter_table('scan_runs', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_scan_runs_org_id'))
        batch_op.drop_index(batch_op.f('ix_scan_runs_connection_id'))
    op.drop_table('scan_runs')

    with op.batch_alter_table('github_connections', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_github_connections_org_id'))
        batch_op.drop_index(batch_op.f('ix_github_connections_github_user_id'))
    op.drop_table('github_connections')
