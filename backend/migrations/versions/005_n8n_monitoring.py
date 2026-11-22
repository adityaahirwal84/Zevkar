"""Add n8n integration, execution, webhook, and diagnosis history fields.

Revision ID: 005_n8n_monitoring
Revises: 004_align_orm_schema
"""
from alembic import op
import sqlalchemy as sa


revision = "005_n8n_monitoring"
down_revision = "004_align_orm_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("integrations", sa.Column("last_connected_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("integrations", sa.Column("webhook_token_hash", sa.String(length=64), nullable=True))
    op.add_column(
        "integrations",
        sa.Column("provider_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.create_index("ix_integrations_webhook_token_hash", "integrations", ["webhook_token_hash"], unique=True)

    op.create_unique_constraint(
        "uq_integration_credentials_integration_type",
        "integration_credentials",
        ["integration_id", "credential_type"],
    )

    op.create_unique_constraint(
        "uq_workflows_integration_external_id",
        "workflows",
        ["integration_id", "external_workflow_id"],
    )

    op.add_column("executions", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("executions", sa.Column("stack_trace", sa.Text(), nullable=True))
    op.create_index(
        "uq_executions_workflow_external_id",
        "executions",
        ["workflow_id", "external_execution_id"],
        unique=True,
        postgresql_where=sa.text("external_execution_id IS NOT NULL"),
    )

    op.add_column("incidents", sa.Column("execution_record_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_incidents_execution_record_id_executions",
        "incidents",
        "executions",
        ["execution_record_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("uq_incidents_execution_record_id", "incidents", ["execution_record_id"], unique=True)
    op.add_column(
        "ai_diagnoses",
        sa.Column("probable_causes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
    )

    op.add_column("webhook_events", sa.Column("integration_id", sa.String(length=36), nullable=True))
    op.create_foreign_key(
        "fk_webhook_events_integration_id_integrations",
        "webhook_events",
        "integrations",
        ["integration_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "webhook_events",
        sa.Column("processing_status", sa.String(length=30), nullable=False, server_default="RECEIVED"),
    )
    op.add_column("webhook_events", sa.Column("processing_error", sa.Text(), nullable=True))
    op.drop_index("ix_webhook_events_idempotency_key", table_name="webhook_events")
    op.drop_constraint("webhook_events_idempotency_key_key", "webhook_events", type_="unique")
    op.create_index("ix_webhook_events_integration_id", "webhook_events", ["integration_id"])
    op.create_index(
        "uq_webhook_events_integration_idempotency",
        "webhook_events",
        ["integration_id", "idempotency_key"],
        unique=True,
    )

    op.drop_constraint("ai_diagnoses_incident_id_key", "ai_diagnoses", type_="unique")
    op.create_index("ix_ai_diagnoses_incident_id", "ai_diagnoses", ["incident_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_diagnoses_incident_id", table_name="ai_diagnoses")
    op.create_unique_constraint("ai_diagnoses_incident_id_key", "ai_diagnoses", ["incident_id"])
    op.drop_column("ai_diagnoses", "probable_causes")

    op.drop_index("uq_webhook_events_integration_idempotency", table_name="webhook_events")
    op.drop_index("ix_webhook_events_integration_id", table_name="webhook_events")
    op.create_unique_constraint(
        "webhook_events_idempotency_key_key",
        "webhook_events",
        ["idempotency_key"],
    )
    op.create_index(
        "ix_webhook_events_idempotency_key",
        "webhook_events",
        ["idempotency_key"],
        unique=True,
    )
    op.drop_column("webhook_events", "processing_error")
    op.drop_column("webhook_events", "processing_status")
    op.drop_constraint(
        "fk_webhook_events_integration_id_integrations",
        "webhook_events",
        type_="foreignkey",
    )
    op.drop_column("webhook_events", "integration_id")

    op.drop_index("uq_incidents_execution_record_id", table_name="incidents")
    op.drop_constraint(
        "fk_incidents_execution_record_id_executions",
        "incidents",
        type_="foreignkey",
    )
    op.drop_column("incidents", "execution_record_id")

    op.drop_index("uq_executions_workflow_external_id", table_name="executions")
    op.drop_column("executions", "stack_trace")
    op.drop_column("executions", "completed_at")

    op.drop_constraint("uq_workflows_integration_external_id", "workflows", type_="unique")
    op.drop_constraint(
        "uq_integration_credentials_integration_type",
        "integration_credentials",
        type_="unique",
    )

    op.drop_index("ix_integrations_webhook_token_hash", table_name="integrations")
    op.drop_column("integrations", "provider_metadata")
    op.drop_column("integrations", "webhook_token_hash")
    op.drop_column("integrations", "last_connected_at")
