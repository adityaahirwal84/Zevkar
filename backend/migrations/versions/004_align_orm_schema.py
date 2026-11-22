"""004_align_orm_schema

Revision ID: 004_align_orm_schema
Revises: 003_fix_runtime_compatibility
Create Date: 2026-11-03 01:00:00.000000

All changes are additive. Existing rows are preserved; newly added references
remain nullable because historical records do not contain their values.
"""
from alembic import op
import sqlalchemy as sa


revision = "004_align_orm_schema"
down_revision = "003_fix_runtime_compatibility"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "workflows",
        sa.Column("avg_duration_ms", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("workflows", sa.Column("last_execution_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workflows", sa.Column("last_successful_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("workflows", sa.Column("last_failed_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column(
        "incidents",
        sa.Column("assigned_member_id", sa.String(length=36), nullable=True),
    )

    op.add_column("ai_diagnoses", sa.Column("diagnosed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "ai_diagnoses",
        sa.Column("is_ai_generated", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "ai_diagnoses",
        sa.Column("token_count", sa.Integer(), nullable=False, server_default="0"),
    )

    op.add_column(
        "recovery_attempts",
        sa.Column(
            "workflow_id",
            sa.String(length=36),
            sa.ForeignKey("workflows.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column("recovery_attempts", sa.Column("initiated_by", sa.String(length=255), nullable=True))
    op.add_column("recovery_attempts", sa.Column("executed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("recovery_attempts", sa.Column("details", sa.Text(), nullable=True))
    op.add_column("recovery_attempts", sa.Column("result_execution_id", sa.String(length=255), nullable=True))

    op.create_index("ix_agency_members_agency_id", "agency_members", ["agency_id"], if_not_exists=True)
    op.create_index("ix_agency_members_user_id", "agency_members", ["user_id"], if_not_exists=True)
    op.create_index("ix_integrations_client_id", "integrations", ["client_id"], if_not_exists=True)
    op.create_index("ix_workflows_client_id", "workflows", ["client_id"], if_not_exists=True)
    op.create_index("ix_workflows_external_workflow_id", "workflows", ["external_workflow_id"], if_not_exists=True)
    op.create_index("ix_incidents_client_id", "incidents", ["client_id"], if_not_exists=True)
    op.create_index("ix_incidents_workflow_id", "incidents", ["workflow_id"], if_not_exists=True)
    op.create_index("ix_incidents_error_category", "incidents", ["error_category"], if_not_exists=True)
    op.create_index("ix_incidents_severity", "incidents", ["severity"], if_not_exists=True)
    op.create_index("ix_incidents_status", "incidents", ["status"], if_not_exists=True)
    op.create_index("ix_recovery_attempts_incident_id", "recovery_attempts", ["incident_id"], if_not_exists=True)
    op.create_index("ix_recovery_approvals_incident_id", "recovery_approvals", ["incident_id"], if_not_exists=True)


def downgrade() -> None:
    op.drop_index("ix_recovery_approvals_incident_id", table_name="recovery_approvals")
    op.drop_index("ix_recovery_attempts_incident_id", table_name="recovery_attempts")
    op.drop_index("ix_incidents_status", table_name="incidents")
    op.drop_index("ix_incidents_severity", table_name="incidents")
    op.drop_index("ix_incidents_error_category", table_name="incidents")
    op.drop_index("ix_incidents_workflow_id", table_name="incidents")
    op.drop_index("ix_incidents_client_id", table_name="incidents")
    op.drop_index("ix_workflows_external_workflow_id", table_name="workflows")
    op.drop_index("ix_workflows_client_id", table_name="workflows")
    op.drop_index("ix_integrations_client_id", table_name="integrations")
    op.drop_index("ix_agency_members_user_id", table_name="agency_members")
    op.drop_index("ix_agency_members_agency_id", table_name="agency_members")

    op.drop_column("recovery_attempts", "result_execution_id")
    op.drop_column("recovery_attempts", "details")
    op.drop_column("recovery_attempts", "executed_at")
    op.drop_column("recovery_attempts", "initiated_by")
    op.drop_column("recovery_attempts", "workflow_id")
    op.drop_column("ai_diagnoses", "token_count")
    op.drop_column("ai_diagnoses", "is_ai_generated")
    op.drop_column("ai_diagnoses", "diagnosed_at")
    op.drop_column("incidents", "assigned_member_id")
    op.drop_column("workflows", "last_failed_at")
    op.drop_column("workflows", "last_successful_at")
    op.drop_column("workflows", "last_execution_at")
    op.drop_column("workflows", "avg_duration_ms")
