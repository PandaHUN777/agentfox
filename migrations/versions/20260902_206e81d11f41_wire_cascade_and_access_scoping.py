"""wire cascade and access-scope declarations (P9, P18)

Adds the two pieces of declared state that let `cascade_risk()` (effects.py) and
`analyse_access()` (data_access.py) actually run against live traffic instead of
only their own test files — both modules were fully built and tested but had zero
callers anywhere else in the codebase before this. Purely additive.

* `tools.triggers_json` — declared downstream effects a tool call sets off (a DB
  trigger, a webhook, a fan-out), the graph `cascade_risk()` walks. No new unique
  constraint needed: `tools` is already `UniqueConstraint("org_id", "key")`-scoped.
* `access_scope_rules` — declares which column on a table decides whose row it is
  (a scoped table) or that a table belongs to nobody (a reference table), the
  declarations `analyse_access()` checks a SQL statement against. Org-scoped from
  day one (`UniqueConstraint("org_id", "table_name")`).

Revision ID: 206e81d11f41
Revises: 565fd97308a1
Create Date: 2026-09-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "206e81d11f41"
down_revision: str | None = "565fd97308a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("tools") as batch_op:
        batch_op.add_column(
            sa.Column("triggers_json", sa.JSON(), nullable=False, server_default="[]")
        )

    op.create_table(
        "access_scope_rules",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("table_name", sa.String(length=160), nullable=False),
        sa.Column("is_reference", sa.Boolean(), nullable=False),
        sa.Column("column", sa.String(length=120), nullable=True),
        sa.Column("principal_key", sa.String(length=120), nullable=False),
        sa.Column("restricted_columns", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("access_scope_rules", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_access_scope_rules_table_name"), ["table_name"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_access_scope_rules_org_id"), ["org_id"], unique=False
        )
        batch_op.create_unique_constraint(
            "ux_access_scope_rules_org_table", ["org_id", "table_name"]
        )


def downgrade() -> None:
    with op.batch_alter_table("access_scope_rules", schema=None) as batch_op:
        batch_op.drop_constraint("ux_access_scope_rules_org_table", type_="unique")
        batch_op.drop_index(batch_op.f("ix_access_scope_rules_org_id"))
        batch_op.drop_index(batch_op.f("ix_access_scope_rules_table_name"))
    op.drop_table("access_scope_rules")

    with op.batch_alter_table("tools") as batch_op:
        batch_op.drop_column("triggers_json")
