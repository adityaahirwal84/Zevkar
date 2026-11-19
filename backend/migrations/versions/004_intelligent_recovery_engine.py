"""004_intelligent_recovery_engine

Revision ID: 004_intelligent_recovery_engine
Revises: 003_n8n_monitoring_sync
Create Date: 2026-11-17 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004_intelligent_recovery_engine'
down_revision = '003_n8n_monitoring_sync'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = inspector.get_table_names()

    # 1. Extend ai_diagnoses with structured recovery recommendation fields
    op.add_column('ai_diagnoses', sa.Column('is_recoverable', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column('ai_diagnoses', sa.Column('recommended_strategy', sa.String(length=64), nullable=False, server_default='MANUAL_RECOVERY'))
    op.add_column('ai_diagnoses', sa.Column('recommendation_reason', sa.Text(), nullable=True))
    op.add_column('ai_diagnoses', sa.Column('expected_risk_level', sa.String(length=20), nullable=False, server_default='HIGH'))
    op.add_column('ai_diagnoses', sa.Column('required_user_action', sa.Text(), nullable=True))
    op.add_column('ai_diagnoses', sa.Column('max_recommended_retries', sa.Integer(), nullable=False, server_default='2'))

    # 2. Organization-level recovery policies (approval_required defaults to TRUE)
    if 'recovery_policies' not in tables:
        op.create_table(
            'recovery_policies',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False, unique=True),
            sa.Column('max_retry_attempts', sa.Integer(), nullable=False, server_default='3'),
            sa.Column('retry_delay_seconds', sa.Integer(), nullable=False, server_default='60'),
            sa.Column('use_exponential_backoff', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('cooldown_seconds', sa.Integer(), nullable=False, server_default='120'),
            sa.Column('approval_required', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('auto_recovery_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('allowed_strategies', sa.JSON(), nullable=False),
            sa.Column('updated_by_user_id', sa.String(length=36), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index('ix_recovery_policies_agency_id', 'recovery_policies', ['agency_id'], unique=True)

    # 3. End-to-end Recovery Requests table
    if 'recovery_requests' not in tables:
        op.create_table(
            'recovery_requests',
            sa.Column('id', sa.String(length=36), primary_key=True),
            sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
            sa.Column('incident_id', sa.String(length=36), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
            sa.Column('workflow_id', sa.String(length=36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
            sa.Column('execution_record_id', sa.String(length=36), sa.ForeignKey('executions.id', ondelete='SET NULL'), nullable=True),
            sa.Column('external_execution_id', sa.String(length=255), nullable=True),
            sa.Column('strategy', sa.String(length=64), nullable=False, server_default='RETRY_EXECUTION'),
            sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING_APPROVAL'),
            sa.Column('is_recoverable', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('risk_level', sa.String(length=20), nullable=False, server_default='HIGH'),
            sa.Column('risk_assessment', sa.JSON(), nullable=True),
            sa.Column('recommended_reason', sa.Text(), nullable=True),
            sa.Column('required_user_action', sa.Text(), nullable=True),
            sa.Column('max_retry_attempts', sa.Integer(), nullable=False, server_default='3'),
            sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('delay_seconds', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('next_retry_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('cooldown_until', sa.DateTime(timezone=True), nullable=True),
            sa.Column('requires_approval', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('requested_by_user_id', sa.String(length=36), nullable=True),
            sa.Column('idempotency_key', sa.String(length=64), nullable=False, unique=True),
            sa.Column('result_verified', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('final_result_summary', sa.Text(), nullable=True),
            sa.Column('last_error', sa.Text(), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index('ix_recovery_requests_agency_id', 'recovery_requests', ['agency_id'])
        op.create_index('ix_recovery_requests_incident_id', 'recovery_requests', ['incident_id'])
        op.create_index('ix_recovery_requests_workflow_id', 'recovery_requests', ['workflow_id'])
        op.create_index('ix_recovery_requests_status', 'recovery_requests', ['status'])
        op.create_index('ix_recovery_requests_idempotency_key', 'recovery_requests', ['idempotency_key'], unique=True)

    # 4. Link recovery_attempts to recovery_requests and track verification
    op.add_column('recovery_attempts', sa.Column('recovery_request_id', sa.String(length=36), sa.ForeignKey('recovery_requests.id', ondelete='CASCADE'), nullable=True))
    op.add_column('recovery_attempts', sa.Column('attempt_number', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('recovery_attempts', sa.Column('strategy', sa.String(length=64), nullable=True))
    op.add_column('recovery_attempts', sa.Column('delay_applied_seconds', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('recovery_attempts', sa.Column('verification_status', sa.String(length=32), nullable=False, server_default='PENDING'))
    op.add_column('recovery_attempts', sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index('ix_recovery_attempts_recovery_request_id', 'recovery_attempts', ['recovery_request_id'])

    # 5. Enrich approval_requests with agency_id, recovery_request_id, and approver_user_id
    op.add_column('approval_requests', sa.Column('recovery_request_id', sa.String(length=36), sa.ForeignKey('recovery_requests.id', ondelete='CASCADE'), nullable=True))
    op.add_column('approval_requests', sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=True))
    op.add_column('approval_requests', sa.Column('approver_user_id', sa.String(length=36), nullable=True))
    op.create_index('ix_approval_requests_recovery_request_id', 'approval_requests', ['recovery_request_id'])
    op.create_index('ix_approval_requests_agency_id', 'approval_requests', ['agency_id'])


def downgrade() -> None:
    op.drop_index('ix_approval_requests_agency_id', table_name='approval_requests')
    op.drop_index('ix_approval_requests_recovery_request_id', table_name='approval_requests')
    op.drop_column('approval_requests', 'approver_user_id')
    op.drop_column('approval_requests', 'agency_id')
    op.drop_column('approval_requests', 'recovery_request_id')

    op.drop_index('ix_recovery_attempts_recovery_request_id', table_name='recovery_attempts')
    op.drop_column('recovery_attempts', 'verified_at')
    op.drop_column('recovery_attempts', 'verification_status')
    op.drop_column('recovery_attempts', 'delay_applied_seconds')
    op.drop_column('recovery_attempts', 'strategy')
    op.drop_column('recovery_attempts', 'attempt_number')
    op.drop_column('recovery_attempts', 'recovery_request_id')

    op.drop_index('ix_recovery_requests_idempotency_key', table_name='recovery_requests')
    op.drop_index('ix_recovery_requests_status', table_name='recovery_requests')
    op.drop_index('ix_recovery_requests_workflow_id', table_name='recovery_requests')
    op.drop_index('ix_recovery_requests_incident_id', table_name='recovery_requests')
    op.drop_index('ix_recovery_requests_agency_id', table_name='recovery_requests')
    op.drop_table('recovery_requests')

    op.drop_index('ix_recovery_policies_agency_id', table_name='recovery_policies')
    op.drop_table('recovery_policies')

    op.drop_column('ai_diagnoses', 'max_recommended_retries')
    op.drop_column('ai_diagnoses', 'required_user_action')
    op.drop_column('ai_diagnoses', 'expected_risk_level')
    op.drop_column('ai_diagnoses', 'recommendation_reason')
    op.drop_column('ai_diagnoses', 'recommended_strategy')
    op.drop_column('ai_diagnoses', 'is_recoverable')
