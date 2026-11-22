"""003_fix_runtime_compatibility

Revision ID: 003_fix_runtime_compatibility
Revises: 002_complete_schema
Create Date: 2026-11-03 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "003_fix_runtime_compatibility"
down_revision = "002_complete_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recovery_approvals", sa.Column("requested_by", sa.String(length=255), nullable=True))
    op.add_column("recovery_approvals", sa.Column("responded_by", sa.String(length=255), nullable=True))

    op.create_table(
        "webhook_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("platform", sa.String(length=50), nullable=False, server_default="generic"),
        sa.Column("event_type", sa.String(length=50), nullable=False, server_default="EXECUTION_RECORD"),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False, unique=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("signature_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_webhook_events_idempotency_key", "webhook_events", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_webhook_events_idempotency_key", table_name="webhook_events")
    op.drop_table("webhook_events")
    op.drop_column("recovery_approvals", "responded_by")
    op.drop_column("recovery_approvals", "requested_by")
