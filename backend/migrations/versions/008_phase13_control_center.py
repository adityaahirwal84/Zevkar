"""008_phase13_control_center

Revision ID: 008_phase13_control_center
Revises: 007_phase12_monitoring_recovery
Create Date: 2026-11-19 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '008_phase13_control_center'
down_revision = '007_phase12_monitoring_recovery'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'workflows' in existing_tables:
        wf_cols = {c['name'] for c in inspector.get_columns('workflows')}
        if 'control_status' not in wf_cols:
            op.add_column(
                'workflows',
                sa.Column('control_status', sa.String(30), nullable=False, server_default='ACTIVE'),
            )
        if 'next_scheduled_at' not in wf_cols:
            op.add_column(
                'workflows',
                sa.Column('next_scheduled_at', sa.DateTime(timezone=True), nullable=True),
            )
        if 'schedule_config' not in wf_cols:
            op.add_column('workflows', sa.Column('schedule_config', sa.JSON(), nullable=True))
        if 'provider_settings' not in wf_cols:
            op.add_column('workflows', sa.Column('provider_settings', sa.JSON(), nullable=True))
        if 'capabilities' not in wf_cols:
            op.add_column('workflows', sa.Column('capabilities', sa.JSON(), nullable=True))
        wf_indexes = {idx['name'] for idx in inspector.get_indexes('workflows')}
        if 'ix_workflows_control_status' not in wf_indexes:
            op.create_index('ix_workflows_control_status', 'workflows', ['control_status'])

    if 'control_action_requests' not in existing_tables:
        op.create_table(
            'control_action_requests',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('agency_id', sa.String(36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
            sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
            sa.Column('integration_id', sa.String(36), sa.ForeignKey('integrations.id', ondelete='SET NULL'), nullable=True),
            sa.Column('incident_id', sa.String(36), sa.ForeignKey('incidents.id', ondelete='SET NULL'), nullable=True),
            sa.Column('platform', sa.String(50), nullable=False),
            sa.Column('action_type', sa.String(50), nullable=False),
            sa.Column('target_execution_id', sa.String(255), nullable=True),
            sa.Column('payload', sa.JSON(), nullable=True),
            sa.Column('status', sa.String(32), nullable=False, server_default='PENDING'),
            sa.Column('risk_level', sa.String(20), nullable=False, server_default='MEDIUM'),
            sa.Column('requires_approval', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('confirmed_by_user', sa.Boolean(), nullable=False, server_default=sa.text('false')),
            sa.Column('idempotency_key', sa.String(64), nullable=False),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.Column('requested_by_user_id', sa.String(36), nullable=True),
            sa.Column('approved_by_user_id', sa.String(36), nullable=True),
            sa.Column('rejected_by_user_id', sa.String(36), nullable=True),
            sa.Column('rejection_reason', sa.Text(), nullable=True),
            sa.Column('executed_by_user_id', sa.String(36), nullable=True),
            sa.Column('sanitized_response', sa.JSON(), nullable=True),
            sa.Column('verification_status', sa.String(32), nullable=False, server_default='PENDING'),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_control_action_requests_agency_id', 'control_action_requests', ['agency_id'])
        op.create_index('ix_control_action_requests_workflow_id', 'control_action_requests', ['workflow_id'])
        op.create_index('ix_control_action_requests_status', 'control_action_requests', ['status'])
        op.create_index(
            'ix_control_action_requests_idempotency_key',
            'control_action_requests',
            ['idempotency_key'],
            unique=True,
        )
        op.create_index('ix_control_actions_agency_status', 'control_action_requests', ['agency_id', 'status'])

    if 'control_activity_logs' not in existing_tables:
        op.create_table(
            'control_activity_logs',
            sa.Column('id', sa.String(36), primary_key=True),
            sa.Column('agency_id', sa.String(36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
            sa.Column(
                'action_request_id',
                sa.String(36),
                sa.ForeignKey('control_action_requests.id', ondelete='SET NULL'),
                nullable=True,
            ),
            sa.Column('workflow_id', sa.String(36), sa.ForeignKey('workflows.id', ondelete='SET NULL'), nullable=True),
            sa.Column('workflow_name', sa.String(255), nullable=True),
            sa.Column('platform', sa.String(50), nullable=False),
            sa.Column('actor_user_id', sa.String(36), nullable=True),
            sa.Column('actor_role', sa.String(50), nullable=True),
            sa.Column('action_type', sa.String(50), nullable=False),
            sa.Column('event_status', sa.String(40), nullable=False),
            sa.Column('summary', sa.Text(), nullable=False),
            sa.Column('redacted_details', sa.JSON(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index('ix_control_activity_logs_agency_id', 'control_activity_logs', ['agency_id'])
        op.create_index('ix_control_activity_logs_created_at', 'control_activity_logs', ['created_at'])
        op.create_index(
            'ix_control_activity_agency_created',
            'control_activity_logs',
            ['agency_id', 'created_at'],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'control_activity_logs' in existing_tables:
        op.drop_table('control_activity_logs')

    if 'control_action_requests' in existing_tables:
        op.drop_table('control_action_requests')

    if 'workflows' in existing_tables:
        wf_indexes = {idx['name'] for idx in inspector.get_indexes('workflows')}
        if 'ix_workflows_control_status' in wf_indexes:
            op.drop_index('ix_workflows_control_status', table_name='workflows')
        wf_cols = {c['name'] for c in inspector.get_columns('workflows')}
        for col in ('capabilities', 'provider_settings', 'schedule_config', 'next_scheduled_at', 'control_status'):
            if col in wf_cols:
                op.drop_column('workflows', col)
