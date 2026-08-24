"""control key uniqueness is per-org, not global

`Control.key` had a plain unique index (`ix_controls_key`), but Control inherits
TimestampMixin -> TenantScoped like every other mapped class (assert_tenant_safe
requires it), so it is tenant-filtered on every read. A global unique index on `key`
alone is incompatible with that: the first org to sync the reference catalog claims
every key, and every other org's sync then fails with a UniqueViolation while its own
(tenant-filtered) SELECT correctly reports the row as absent — which is exactly the
bug this migration fixes. Uniqueness moves to (org_id, key), so each org can hold its
own synced copy of the same shared catalog content.

Revision ID: 06f58cbd4fad
Revises: 1f29e0eafa60
Create Date: 2026-08-24 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = '06f58cbd4fad'
down_revision: str | None = '1f29e0eafa60'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('controls', schema=None) as batch_op:
        batch_op.drop_index('ix_controls_key')
        batch_op.create_index(batch_op.f('ix_controls_key'), ['key'], unique=False)
        batch_op.create_unique_constraint('ux_controls_org_key', ['org_id', 'key'])


def downgrade() -> None:
    with op.batch_alter_table('controls', schema=None) as batch_op:
        batch_op.drop_constraint('ux_controls_org_key', type_='unique')
        batch_op.drop_index(batch_op.f('ix_controls_key'))
        batch_op.create_index('ix_controls_key', ['key'], unique=True)
