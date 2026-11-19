"""002_complete_schema

Revision ID: 002_complete_schema
Revises: 001_initial_schema
Create Date: 2026-11-02 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_complete_schema'
down_revision = '001_initial_schema'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 11. Executions
    op.create_table(
        'executions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('workflow_id', sa.String(length=36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
        sa.Column('external_execution_id', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('duration_ms', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('error_payload', sa.JSON(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
    )
    op.create_index('ix_executions_workflow_id', 'executions', ['workflow_id'])
    op.create_index('ix_executions_external_id', 'executions', ['external_execution_id'])

    # 12. Notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('incident_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_notifications_agency_id', 'notifications', ['agency_id'])

    # 13. Audit Logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=True),
        sa.Column('action', sa.String(length=100), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('entity_id', sa.String(length=36), nullable=False),
        sa.Column('details', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_audit_logs_agency_id', 'audit_logs', ['agency_id'])

    # 14. Invitations
    op.create_table(
        'invitations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='MEMBER'),
        sa.Column('token', sa.String(length=255), nullable=False, unique=True),
        sa.Column('invited_by', sa.String(length=36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_invitations_agency_id', 'invitations', ['agency_id'])
    op.create_index('ix_invitations_email', 'invitations', ['email'])
    op.create_index('ix_invitations_token', 'invitations', ['token'])

    # 15. Refresh Tokens
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token_hash', sa.String(length=255), nullable=False, unique=True),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('rotated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_refresh_tokens_user_id', 'refresh_tokens', ['user_id'])
    op.create_index('ix_refresh_tokens_token_hash', 'refresh_tokens', ['token_hash'])

    # 16. User Sessions
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('device_info', sa.String(length=255), nullable=True),
        sa.Column('ip_address', sa.String(length=50), nullable=True),
        sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_sessions_user_id', 'sessions', ['user_id'])

    # 17. Integration Credentials
    op.create_table(
        'integration_credentials',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('integration_id', sa.String(length=36), sa.ForeignKey('integrations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('credential_type', sa.String(length=50), nullable=False),
        sa.Column('encrypted_data', sa.Text(), nullable=False),
        sa.Column('key_id', sa.String(length=50), nullable=False, server_default='v1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_integration_credentials_integration_id', 'integration_credentials', ['integration_id'])

    # 18. Notification Preferences
    op.create_table(
        'notification_preferences',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('channel', sa.String(length=50), nullable=False, server_default='IN_APP'),
        sa.Column('min_severity', sa.String(length=50), nullable=False, server_default='HIGH'),
        sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_notification_preferences_user_id', 'notification_preferences', ['user_id'])

    # 19. Subscription Plans
    op.create_table(
        'subscription_plans',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('tier_code', sa.String(length=50), nullable=False, unique=True),
        sa.Column('monthly_price_cents', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_workflows', sa.Integer(), nullable=False, server_default='10'),
        sa.Column('max_incidents_per_month', sa.Integer(), nullable=False, server_default='500'),
        sa.Column('ai_diagnoses_included', sa.Integer(), nullable=False, server_default='200'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_subscription_plans_tier_code', 'subscription_plans', ['tier_code'])

    # 20. Usage Records
    op.create_table(
        'usage_records',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('billing_period', sa.String(length=7), nullable=False),
        sa.Column('incidents_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('ai_diagnoses_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('recovery_attempts_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_usage_records_agency_id', 'usage_records', ['agency_id'])
    op.create_index('ix_usage_records_billing_period', 'usage_records', ['billing_period'])

def downgrade() -> None:
    op.drop_table('usage_records')
    op.drop_table('subscription_plans')
    op.drop_table('notification_preferences')
    op.drop_table('integration_credentials')
    op.drop_table('sessions')
    op.drop_table('refresh_tokens')
    op.drop_table('invitations')
    op.drop_table('audit_logs')
    op.drop_table('notifications')
    op.drop_table('executions')
