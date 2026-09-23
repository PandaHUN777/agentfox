"""playground sandboxes live in the database, not in one process's memory

Adds `playground_sandboxes`: the registry row for one public-playground sandbox.

A sandbox is a tenant — its `org_id` is its own id — so this table holds only what has
to be known *before* a tenant can be bound: the id, when the sandbox expires, when it
was last used, and the trace ids its own sidebar replays. Everything else a visitor
produces is an ordinary tenant-scoped row in the tables that already exist.

Why it is needed: sandboxes were a module-level dict of per-sandbox in-memory SQLite
engines, which cannot survive the serverless deployment in `api/vercel.json`. A
visitor's follow-up request landing on another instance found nothing and was told the
sandbox had expired, at a rate that looked like a short timer and was routing.

Also makes `users.email` unique **per tenant** instead of globally, the same
correction `217f32001df6` made to several other tables. A global unique meant two
tenants could not both have a user at the same address, and it is what actually
blocked a second seeded world from existing in one database: `seed.seed` tests for an
existing user with a tenant-filtered query, so it inserted and the global index
rejected the insert. No data is moved and no row is dropped; only the constraint
widens, so this cannot fail on existing data.

Re-runnable: every object is created only if it is missing and the old index dropped
only if it is present, because `init_db()`'s create_all can leave a database holding
this revision's schema while its recorded revision is still the previous one.

Revision ID: c4a71e8b2d16
Revises: d5e2a9c14f03
Create Date: 2026-09-23 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4a71e8b2d16"
down_revision: str | None = "d5e2a9c14f03"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(table: str) -> bool:
    return table in _inspector().get_table_names()


def _has_index(table: str, index: str) -> bool:
    return any(i["name"] == index for i in _inspector().get_indexes(table))


def _has_constraint(table: str, name: str) -> bool:
    inspector = _inspector()
    named = {c.get("name") for c in inspector.get_unique_constraints(table)}
    named |= {i["name"] for i in inspector.get_indexes(table)}
    return name in named


def upgrade() -> None:
    if not _has_table("playground_sandboxes"):
        op.create_table(
            "playground_sandboxes",
            sa.Column("id", sa.String(length=64), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("trace_ids", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("org_id", sa.String(length=64), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )

    with op.batch_alter_table("playground_sandboxes", schema=None) as batch_op:
        for name, columns in (
            # The sweep's only query: expired sandboxes, across every tenant.
            ("ix_playground_sandboxes_expires_at", ["expires_at"]),
            ("ix_playground_sandboxes_org_id", ["org_id"]),
        ):
            if not _has_index("playground_sandboxes", name):
                batch_op.create_index(name, columns, unique=False)

    # users.email: global unique -> (org_id, email). SQLite cannot alter a constraint
    # in place, so batch_alter_table rebuilds the table; on Postgres these are plain
    # DDL statements.
    with op.batch_alter_table("users", schema=None) as batch_op:
        if _has_index("users", "ix_users_email"):
            batch_op.drop_index("ix_users_email")
        if not _has_constraint("users", "ux_users_org_email"):
            batch_op.create_unique_constraint("ux_users_org_email", ["org_id", "email"])
    with op.batch_alter_table("users", schema=None) as batch_op:
        if not _has_index("users", "ix_users_email"):
            batch_op.create_index("ix_users_email", ["email"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_index("ix_users_email")
        batch_op.drop_constraint("ux_users_org_email", type_="unique")
        batch_op.create_index("ix_users_email", ["email"], unique=True)

    with op.batch_alter_table("playground_sandboxes", schema=None) as batch_op:
        batch_op.drop_index("ix_playground_sandboxes_org_id")
        batch_op.drop_index("ix_playground_sandboxes_expires_at")
    op.drop_table("playground_sandboxes")
