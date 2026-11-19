"""003_n8n_monitoring_sync

Revision ID: 003_n8n_monitoring_sync
Revises: 002_complete_schema
Create Date: 2026-11-17 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_n8n_monitoring_sync'
down_revision = '002_complete_schema'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Timezone preferences on agencies & users
    op.add_column('agencies', sa.Column('timezone', sa.String(length=64), nullable=False, server_default='UTC'))
    op.add_column('users', sa.Column('timezone', sa.String(length=64), nullable=False, server_default='UTC'))

    # 2. Persistent sync checkpoints & status on integrations
    op.add_column('integrations', sa.Column('last_execution_watermark', sa.DateTime(timezone=True), nullable=True))
    op.add_column('integrations', sa.Column('sync_cursor', sa.String(length=255), nullable=True))
    op.add_column('integrations', sa.Column('last_sync_status', sa.String(length=50), nullable=False, server_default='IDLE'))
    op.add_column('integrations', sa.Column('last_sync_error', sa.Text(), nullable=True))
    op.add_column('integrations', sa.Column('webhook_secret_encrypted', sa.Text(), nullable=True))

    # 3. Workflow reliability & stuck-threshold fields
    op.add_column('workflows', sa.Column('avg_duration_ms', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('workflows', sa.Column('stuck_timeout_seconds', sa.Integer(), nullable=True))
    op.add_column('workflows', sa.Column('allow_long_running', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('workflows', sa.Column('last_execution_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('workflows', sa.Column('last_successful_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('workflows', sa.Column('last_failed_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        'ix_workflows_agency_platform_external',
        'workflows',
        ['agency_id', 'platform', 'external_workflow_id'],
        unique=True,
    )

    # 4. Execution enrichment & deduplication constraint
    op.add_column('executions', sa.Column('integration_id', sa.String(length=36), sa.ForeignKey('integrations.id', ondelete='SET NULL'), nullable=True))
    op.add_column('executions', sa.Column('raw_status', sa.String(length=50), nullable=True))
    op.add_column('executions', sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('executions', sa.Column('mode', sa.String(length=50), nullable=True))
    op.add_column('executions', sa.Column('is_stuck_alerted', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('executions', sa.Column('synced_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.create_index('ix_executions_integration_id', 'executions', ['integration_id'])
    op.create_index('ix_executions_started_at', 'executions', ['started_at'])
    op.create_index('ix_executions_wf_external_unique', 'executions', ['workflow_id', 'external_execution_id'], unique=True)

    # 5. Incident linkage to execution record
    op.add_column('incidents', sa.Column('execution_record_id', sa.String(length=36), sa.ForeignKey('executions.id', ondelete='SET NULL'), nullable=True))
    op.add_column('incidents', sa.Column('assigned_member_id', sa.String(length=36), nullable=True))
    op.create_index('ix_incidents_execution_record_id', 'incidents', ['execution_record_id'])

    # 6. AI Diagnosis model & fallback transparency
    op.add_column('ai_diagnoses', sa.Column('is_ai_generated', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('ai_diagnoses', sa.Column('model_used', sa.String(length=100), nullable=False, server_default='gemini-4-hydrogen'))
    op.add_column('ai_diagnoses', sa.Column('fallback_reason', sa.Text(), nullable=True))
    op.add_column('ai_diagnoses', sa.Column('diagnosed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column('ai_diagnoses', sa.Column('token_count', sa.Integer(), nullable=False, server_default='0'))

    # 7. Recovery attempts alignment
    op.add_column('recovery_attempts', sa.Column('workflow_id', sa.String(length=36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=True))
    op.add_column('recovery_attempts', sa.Column('initiated_by', sa.String(length=255), nullable=False, server_default='system'))
    op.add_column('recovery_attempts', sa.Column('executed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()))
    op.add_column('recovery_attempts', sa.Column('details', sa.Text(), nullable=True))
    op.add_column('recovery_attempts', sa.Column('result_execution_id', sa.String(length=255), nullable=True))

    # 8. Reconcile approval_requests table name with entities.py
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()
    if 'recovery_approvals' in tables and 'approval_requests' not in tables:
        op.rename_table('recovery_approvals', 'approval_requests')
        op.add_column('approval_requests', sa.Column('requested_by', sa.String(length=255), nullable=False, server_default='Zevkar Engine'))
        op.add_column('approval_requests', sa.Column('responded_by', sa.String(length=255), nullable=True))

    # 9. Durable webhook events table
    if 'webhook_events' not in tables:
        op.create_table(
            'webhook_events',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=True),
            sa.Column('integration_id', sa.String(length=36), sa.ForeignKey('integrations.id', ondelete='SET NULL'), nullable=True),
            sa.Column('platform', sa.String(length=50), nullable=False, server_default='n8n'),
            sa.Column('event_type', sa.String(length=50), nullable=False, server_default='EXECUTION_RECORD'),
            sa.Column('idempotency_key', sa.String(length=64), nullable=False, unique=True),
            sa.Column('payload', sa.JSON(), nullable=False),
            sa.Column('signature_verified', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('received_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index('ix_webhook_events_agency_id', 'webhook_events', ['agency_id'])
        op.create_index('ix_webhook_events_idempotency_key', 'webhook_events', ['idempotency_key'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    if 'webhook_events' in tables:
        op.drop_table('webhook_events')

    if 'approval_requests' in tables and 'recovery_approvals' not in tables:
        op.drop_column('approval_requests', 'responded_by')
        op.drop_column('approval_requests', 'requested_by')
        op.rename_table('approval_requests', 'recovery_approvals')

    op.drop_column('recovery_attempts', 'result_execution_id')
    op.drop_column('recovery_attempts', 'details')
    op.drop_column('recovery_attempts', 'executed_at')
    op.drop_column('recovery_attempts', 'initiated_by')
    op.drop_column('recovery_attempts', 'workflow_id')

    op.drop_column('ai_diagnoses', 'token_count')
    op.drop_column('ai_diagnoses', 'diagnosed_at')
    op.drop_column('ai_diagnoses', 'fallback_reason')
    op.drop_column('ai_diagnoses', 'model_used')
    op.drop_column('ai_diagnoses', 'is_ai_generated')

    op.drop_index('ix_incidents_execution_record_id', table_name='incidents')
    op.drop_column('incidents', 'assigned_member_id')
    op.drop_column('incidents', 'execution_record_id')

    op.drop_index('ix_executions_wf_external_unique', table_name='executions')
    op.drop_index('ix_executions_started_at', table_name='executions')
    op.drop_index('ix_executions_integration_id', table_name='executions')
    op.drop_column('executions', 'synced_at')
    op.drop_column('executions', 'is_stuck_alerted')
    op.drop_column('executions', 'mode')
    op.drop_column('executions', 'finished_at')
    op.drop_column('executions', 'raw_status')
    op.drop_column('executions', 'integration_id')

    op.drop_index('ix_workflows_agency_platform_external', table_name='workflows')
    op.drop_column('workflows', 'last_failed_at')
    op.drop_column('workflows', 'last_successful_at')
    op.drop_column('workflows', 'last_execution_at')
    op.drop_column('workflows', 'allow_long_running')
    op.drop_column('workflows', 'stuck_timeout_seconds')
    op.drop_column('workflows', 'avg_duration_ms')

    op.drop_column('integrations', 'webhook_secret_encrypted')
    op.drop_column('integrations', 'last_sync_error')
    op.drop_column('integrations', 'last_sync_status')
    op.drop_column('integrations', 'sync_cursor')
    op.drop_column('integrations', 'last_execution_watermark')

    op.drop_column('users', 'timezone')
    op.drop_column('agencies', 'timezone')
