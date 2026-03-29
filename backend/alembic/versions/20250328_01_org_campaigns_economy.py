"""organization_settings, survey_campaigns, surveys.campaign_id, recommendations.text_employee

Revision ID: 20250328_01
Revises:
Create Date: 2025-03-28

"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20250328_01"
down_revision = None
branch_labels = None
depends_on = None


def _is_sqlite() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "sqlite"


def upgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if insp.has_table("recommendations"):
        cols = {c["name"] for c in insp.get_columns("recommendations")}
        if "text_employee" not in cols:
            if _is_sqlite():
                with op.batch_alter_table("recommendations") as batch:
                    batch.add_column(sa.Column("text_employee", sa.Text(), nullable=True))
            else:
                op.add_column("recommendations", sa.Column("text_employee", sa.Text(), nullable=True))

    if not insp.has_table("organization_settings"):
        op.create_table(
            "organization_settings",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("default_fot", sa.Float(), nullable=True),
            sa.Column("default_k", sa.Float(), nullable=True),
            sa.Column("default_c_replace", sa.Float(), nullable=True),
            sa.Column("default_departed_count", sa.Integer(), nullable=True),
        )
        op.execute(sa.text("INSERT INTO organization_settings (id) VALUES (1)"))

    if not insp.has_table("survey_campaigns"):
        op.create_table(
            "survey_campaigns",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("starts_at", sa.Date(), nullable=True),
            sa.Column("ends_at", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("id"),
        )

    insp = sa.inspect(conn)
    if insp.has_table("surveys"):
        cols = {c["name"] for c in insp.get_columns("surveys")}
        if "campaign_id" not in cols and insp.has_table("survey_campaigns"):
            if _is_sqlite():
                with op.batch_alter_table("surveys") as batch:
                    batch.add_column(sa.Column("campaign_id", sa.Integer(), nullable=True))
                    batch.create_foreign_key(
                        "fk_surveys_campaign_id",
                        "survey_campaigns",
                        ["campaign_id"],
                        ["id"],
                    )
            else:
                op.add_column("surveys", sa.Column("campaign_id", sa.Integer(), nullable=True))
                op.create_foreign_key(
                    "fk_surveys_campaign_id",
                    "surveys",
                    "survey_campaigns",
                    ["campaign_id"],
                    ["id"],
                )


def downgrade() -> None:
    conn = op.get_bind()
    insp = sa.inspect(conn)

    if insp.has_table("surveys") and "campaign_id" in {c["name"] for c in insp.get_columns("surveys")}:
        if _is_sqlite():
            with op.batch_alter_table("surveys") as batch:
                batch.drop_constraint("fk_surveys_campaign_id", type_="foreignkey")
                batch.drop_column("campaign_id")
        else:
            op.drop_constraint("fk_surveys_campaign_id", "surveys", type_="foreignkey")
            op.drop_column("surveys", "campaign_id")

    if insp.has_table("survey_campaigns"):
        op.drop_table("survey_campaigns")
    if insp.has_table("organization_settings"):
        op.drop_table("organization_settings")

    if insp.has_table("recommendations") and "text_employee" in {
        c["name"] for c in insp.get_columns("recommendations")
    }:
        if _is_sqlite():
            with op.batch_alter_table("recommendations") as batch:
                batch.drop_column("text_employee")
        else:
            op.drop_column("recommendations", "text_employee")
