"""more tenant-scoped uniqueness was global, not per-org

Same defect as 06f58cbd4fad (Control.key), found by auditing every unique
constraint on every tenant-scoped table rather than waiting to trip over each one:
Agent.slug, Tool.key, McpServer.name, Identity.principal, SourceRecord.key,
EvalSuite.key, RetentionPolicy.data_class and Policy.key were all globally unique
on a model that inherits TenantScoped. Two orgs picking the same agent slug (or
tool key, or the "baseline" policy key every org's onboarding proposes) would
collide — this is precisely how Agent.slug was hit in production: a second org's
inline traffic to an agent named the same as another org's threw a
UniqueViolation while its own tenant-filtered read correctly reported the agent
absent.

Moves uniqueness to (org_id, <column>) for all eight, matching every other
tenant-scoped table in this schema that already does this correctly
(PolicyBinding, AuditEntry's uq_audit_org_seq, etc). The existing unique
constraint's name isn't assumed — some were SQLAlchemy-named indexes
(ix_<table>_<column>), others were bare `unique=True` columns that only Postgres
auto-names and SQLite doesn't name at all — so it's looked up via SQLAlchemy's own
reflection, which works the same way against both dialects (SQLite dev/test DBs
and the Postgres production DB), rather than hand-written per-dialect DDL.

Revision ID: 217f32001df6
Revises: 06f58cbd4fad
Create Date: 2026-08-24 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '217f32001df6'
down_revision: str | None = '06f58cbd4fad'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLES = [
    ("agents", "slug", "ux_agents_org_slug"),
    ("tools", "key", "ux_tools_org_key"),
    ("mcp_servers", "name", "ux_mcp_servers_org_name"),
    ("identities", "principal", "ux_identities_org_principal"),
    ("source_records", "key", "ux_source_records_org_key"),
    ("eval_suites", "key", "ux_eval_suites_org_key"),
    ("retention_policies", "data_class", "ux_retention_policies_org_data_class"),
    ("policies", "key", "ux_policies_org_key"),
]


#: Names an existing anonymous unique constraint on `%(table_name)s.%(column_0_name)s`
#: deterministically, so batch mode can target it for dropping even on SQLite, where
#: a bare `unique=True` column reflects back with no name at all (an autoindex).
_NAMING_CONVENTION = {"uq": "anon_uq_%(table_name)s_%(column_0_name)s"}


def _existing_single_column_unique(inspector, table: str, column: str) -> tuple[str, str] | None:
    """Returns (kind, name) — kind is "constraint" or "index", since a plain
    `unique=True` column materializes as a table constraint but `unique=True,
    index=True` materializes as a unique index, and dropping one the other way
    fails on both dialects."""
    for uc in inspector.get_unique_constraints(table):
        if uc["column_names"] == [column]:
            return "constraint", uc["name"] or f"anon_uq_{table}_{column}"
    for ix in inspector.get_indexes(table):
        if ix.get("unique") and ix["column_names"] == [column]:
            return "index", ix["name"]
    return None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, column, new_name in _TABLES:
        found = _existing_single_column_unique(inspector, table, column)
        with op.batch_alter_table(
            table, schema=None, naming_convention=_NAMING_CONVENTION
        ) as batch_op:
            if found:
                kind, old_name = found
                if kind == "constraint":
                    batch_op.drop_constraint(old_name, type_="unique")
                else:
                    batch_op.drop_index(old_name)
            batch_op.create_index(batch_op.f(f"ix_{table}_{column}"), [column], unique=False)
            batch_op.create_unique_constraint(new_name, ["org_id", column])


#: These two had bare `unique=True` (no explicit index) before this migration, so
#: downgrading restores a bare unique constraint rather than a unique index.
_WAS_BARE_UNIQUE = {("mcp_servers", "name"), ("retention_policies", "data_class")}


def downgrade() -> None:
    for table, column, new_name in reversed(_TABLES):
        with op.batch_alter_table(table, schema=None) as batch_op:
            batch_op.drop_constraint(new_name, type_="unique")
            batch_op.drop_index(batch_op.f(f"ix_{table}_{column}"))
            if (table, column) in _WAS_BARE_UNIQUE:
                batch_op.create_unique_constraint(f"uq_{table}_{column}", [column])
            else:
                batch_op.create_index(batch_op.f(f"ix_{table}_{column}"), [column], unique=True)
