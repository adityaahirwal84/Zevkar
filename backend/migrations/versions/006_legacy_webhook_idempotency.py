"""Preserve uniqueness for legacy webhooks after tenant-scoped key migration.

Revision ID: 006_legacy_webhook_idempotency
Revises: 005_n8n_monitoring
"""
from alembic import op
import sqlalchemy as sa


revision = "006_legacy_webhook_idempotency"
down_revision = "005_n8n_monitoring"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_webhook_events_legacy_idempotency",
        "webhook_events",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("integration_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_webhook_events_legacy_idempotency", table_name="webhook_events")
