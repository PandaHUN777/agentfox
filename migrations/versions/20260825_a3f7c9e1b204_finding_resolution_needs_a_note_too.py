"""finding resolution needs a note, same as suppression already requires

A one-click "resolved" with no justification and no re-check of the underlying
evidence is how a still-broken critical finding (e.g. a red-team run showing
0% of attacks blocked) disappears from the executive view without anyone
having actually fixed anything. `suppression_reason`/`suppressed_by` already
make suppression accountable; this adds the equivalent pair for resolution so
the same discipline applies to both terminal states.

Revision ID: a3f7c9e1b204
Revises: 217f32001df6
Create Date: 2026-08-25 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'a3f7c9e1b204'
down_revision: str | None = '217f32001df6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("findings") as batch_op:
        batch_op.add_column(sa.Column("resolution_note", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("resolved_by", sa.String(length=120), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("findings") as batch_op:
        batch_op.drop_column("resolved_by")
        batch_op.drop_column("resolution_note")
