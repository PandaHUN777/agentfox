"""entitlement principals grants and disclosure

P10. Additive only — three new tables.

Revision ID: fe29ac688fe6
Revises: 00da42ce9385
Create Date: 2026-08-19 15:24:09.860252
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'fe29ac688fe6'
down_revision: str | None = '00da42ce9385'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('disclosure_events',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('trace_id', sa.String(length=40), nullable=True),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('principal_subject', sa.String(length=200), nullable=True),
    sa.Column('stage', sa.String(length=16), nullable=False),
    sa.Column('candidates', sa.Integer(), nullable=False),
    sa.Column('withheld', sa.Integer(), nullable=False),
    sa.Column('reasons_json', sa.JSON(), nullable=False),
    sa.Column('over_permission', sa.Float(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('disclosure_events', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_disclosure_events_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_disclosure_events_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_disclosure_events_principal_subject'), ['principal_subject'], unique=False)
        batch_op.create_index(batch_op.f('ix_disclosure_events_trace_id'), ['trace_id'], unique=False)

    op.create_table('end_user_principals',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('subject', sa.String(length=200), nullable=False),
    sa.Column('display', sa.String(length=200), nullable=False),
    sa.Column('agent_id', sa.String(length=40), nullable=True),
    sa.Column('groups', sa.JSON(), nullable=False),
    sa.Column('clearances', sa.JSON(), nullable=False),
    sa.Column('purposes', sa.JSON(), nullable=False),
    sa.Column('residency', sa.String(length=16), nullable=True),
    sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('end_user_principals', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_end_user_principals_agent_id'), ['agent_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_end_user_principals_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_end_user_principals_subject'), ['subject'], unique=False)
        batch_op.create_index('ix_principal_subject', ['subject', 'agent_id'], unique=False)

    op.create_table('resource_grants',
    sa.Column('id', sa.String(length=40), nullable=False),
    sa.Column('resource', sa.String(length=500), nullable=False),
    sa.Column('principal_kind', sa.String(length=16), nullable=False),
    sa.Column('principal', sa.String(length=200), nullable=False),
    sa.Column('classes', sa.JSON(), nullable=False),
    sa.Column('purposes', sa.JSON(), nullable=False),
    sa.Column('residency', sa.String(length=16), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('org_id', sa.String(length=64), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('resource_grants', schema=None) as batch_op:
        batch_op.create_index('ix_grant_resource', ['resource', 'principal_kind', 'principal'], unique=False)
        batch_op.create_index(batch_op.f('ix_resource_grants_org_id'), ['org_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_resource_grants_principal'), ['principal'], unique=False)
        batch_op.create_index(batch_op.f('ix_resource_grants_resource'), ['resource'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('resource_grants', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_resource_grants_resource'))
        batch_op.drop_index(batch_op.f('ix_resource_grants_principal'))
        batch_op.drop_index(batch_op.f('ix_resource_grants_org_id'))
        batch_op.drop_index('ix_grant_resource')

    op.drop_table('resource_grants')
    with op.batch_alter_table('end_user_principals', schema=None) as batch_op:
        batch_op.drop_index('ix_principal_subject')
        batch_op.drop_index(batch_op.f('ix_end_user_principals_subject'))
        batch_op.drop_index(batch_op.f('ix_end_user_principals_org_id'))
        batch_op.drop_index(batch_op.f('ix_end_user_principals_agent_id'))

    op.drop_table('end_user_principals')
    with op.batch_alter_table('disclosure_events', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_disclosure_events_trace_id'))
        batch_op.drop_index(batch_op.f('ix_disclosure_events_principal_subject'))
        batch_op.drop_index(batch_op.f('ix_disclosure_events_org_id'))
        batch_op.drop_index(batch_op.f('ix_disclosure_events_agent_id'))

    op.drop_table('disclosure_events')
