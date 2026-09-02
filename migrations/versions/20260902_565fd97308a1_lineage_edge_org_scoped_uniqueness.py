"""lineage edge org-scoped uniqueness

`uq_lineage_edge` (on lineage_edges.src_id, dst_id, relation) was the sole
composite unique constraint in the whole schema missing org_id — every other
natural-key uniqueness constraint in models.py already scopes by org
(ux_agents_org_slug, ux_tools_org_key, ux_mcp_servers_org_name, etc.), and this
one was left out. In a single-org deployment nothing detects it, since there's
only ever one org's rows to collide with. Once a second org registers an agent
whose lineage edge happens to match another org's (src_id, dst_id, relation) —
plausible any time two orgs both have, say, a "support-agent" connecting to a
"support-tools" MCP server — `record_edge()`'s insert-if-not-found path
(registry/service.py) raises a bare UniqueViolation instead of just recording
its own org's edge, since the DB-level constraint has no way to know the two
rows belong to different tenants. Found live: a real second-org write hit this
exact collision against a stray first-org row with the same names.

Widening src_id/dst_id/relation uniqueness to include org_id doesn't change any
existing row's validity — global uniqueness is a strict subset of per-org
uniqueness, so no existing data can violate the new constraint.

Revision ID: 565fd97308a1
Revises: a1b2c3d4e5f6
Create Date: 2026-09-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "565fd97308a1"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("lineage_edges") as batch_op:
        batch_op.drop_constraint("uq_lineage_edge", type_="unique")
        batch_op.create_unique_constraint(
            "uq_lineage_edge", ["org_id", "src_id", "dst_id", "relation"]
        )


def downgrade() -> None:
    with op.batch_alter_table("lineage_edges") as batch_op:
        batch_op.drop_constraint("uq_lineage_edge", type_="unique")
        batch_op.create_unique_constraint(
            "uq_lineage_edge", ["src_id", "dst_id", "relation"]
        )
