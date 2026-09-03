"""eval annotation queue (P4)

Adds eval_annotations: human review of a borderline eval result (score near the
scorer's own threshold, or scorers disagreeing on the same case) — mirrors
Finding's own status/note/actor shape rather than inventing a new one. Purely
additive.

Revision ID: a2a6d7619187
Revises: 206e81d11f41
Create Date: 2026-09-02 00:00:00.000000
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2a6d7619187"
down_revision: str | None = "206e81d11f41"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "eval_annotations",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("eval_result_id", sa.String(length=40), nullable=False),
        sa.Column("verdict", sa.String(length=16), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("annotator", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("org_id", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["eval_result_id"], ["eval_results.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("eval_annotations", schema=None) as batch_op:
        batch_op.create_index(
            batch_op.f("ix_eval_annotations_eval_result_id"), ["eval_result_id"], unique=False
        )
        batch_op.create_index(
            batch_op.f("ix_eval_annotations_org_id"), ["org_id"], unique=False
        )
        batch_op.create_unique_constraint(
            "ux_eval_annotations_org_result_annotator",
            ["org_id", "eval_result_id", "annotator"],
        )


def downgrade() -> None:
    with op.batch_alter_table("eval_annotations", schema=None) as batch_op:
        batch_op.drop_constraint("ux_eval_annotations_org_result_annotator", type_="unique")
        batch_op.drop_index(batch_op.f("ix_eval_annotations_org_id"))
        batch_op.drop_index(batch_op.f("ix_eval_annotations_eval_result_id"))
    op.drop_table("eval_annotations")
