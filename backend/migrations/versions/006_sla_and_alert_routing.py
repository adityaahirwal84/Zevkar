"""006_sla_and_alert_routing

Revision ID: 006_sla_and_alert_routing
Revises: 005_onboarding_and_activation
Create Date: 2026-11-18 12:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '006_sla_and_alert_routing'
down_revision = '005_onboarding_and_activation'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'sla_policies' not in existing_tables:
        op.create_table(
            'sla_policies',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('agency_id', sa.String(length=36), nullable=False),
            sa.Column('target_success_rate_percent', sa.Float(), nullable=False, server_default='99.0'),
            sa.Column('target_mttr_minutes', sa.Integer(), nullable=False, server_default='15'),
            sa.Column('max_open_critical_incidents', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('evaluation_window_hours', sa.Integer(), nullable=False, server_default='24'),
            sa.Column('updated_by_user_id', sa.String(length=36), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('agency_id'),
        )
        op.create_index('ix_sla_policies_agency_id', 'sla_policies', ['agency_id'])

    if 'alert_channels' not in existing_tables:
        op.create_table(
            'alert_channels',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('agency_id', sa.String(length=36), nullable=False),
            sa.Column('name', sa.String(length=120), nullable=False),
            sa.Column('channel_type', sa.String(length=40), nullable=False),
            sa.Column('target_preview', sa.String(length=255), nullable=False),
            sa.Column('encrypted_target_url', sa.Text(), nullable=True),
            sa.Column('encrypted_signing_secret', sa.Text(), nullable=True),
            sa.Column('signing_secret_preview', sa.String(length=64), nullable=True),
            sa.Column('min_severity', sa.String(length=20), nullable=False, server_default='HIGH'),
            sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('last_tested_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_delivery_status', sa.String(length=30), nullable=True),
            sa.Column('last_error', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_alert_channels_agency_id', 'alert_channels', ['agency_id'])

    if 'reliability_rules' not in existing_tables:
        op.create_table(
            'reliability_rules',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('agency_id', sa.String(length=36), nullable=False),
            sa.Column('name', sa.String(length=150), nullable=False),
            sa.Column('condition_type', sa.String(length=50), nullable=False),
            sa.Column('threshold_value', sa.Float(), nullable=False, server_default='3.0'),
            sa.Column('severity', sa.String(length=20), nullable=False, server_default='HIGH'),
            sa.Column('action_type', sa.String(length=50), nullable=False, server_default='NOTIFY_CHANNELS'),
            sa.Column('target_channel_ids', sa.JSON(), nullable=False),
            sa.Column('cooldown_minutes', sa.Integer(), nullable=False, server_default='15'),
            sa.Column('is_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('last_triggered_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('trigger_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_reliability_rules_agency_id', 'reliability_rules', ['agency_id'])
        op.create_index('ix_reliability_rules_agency_enabled', 'reliability_rules', ['agency_id', 'is_enabled'])

    if 'alert_deliveries' not in existing_tables:
        op.create_table(
            'alert_deliveries',
            sa.Column('id', sa.String(length=36), nullable=False),
            sa.Column('agency_id', sa.String(length=36), nullable=False),
            sa.Column('channel_id', sa.String(length=36), nullable=False),
            sa.Column('channel_name', sa.String(length=120), nullable=False),
            sa.Column('channel_type', sa.String(length=40), nullable=False),
            sa.Column('rule_id', sa.String(length=36), nullable=True),
            sa.Column('rule_name', sa.String(length=150), nullable=True),
            sa.Column('event_type', sa.String(length=40), nullable=False),
            sa.Column('severity', sa.String(length=20), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=30), nullable=False),
            sa.Column('http_status', sa.Integer(), nullable=True),
            sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('dispatched_via', sa.String(length=32), nullable=False, server_default='SYNC'),
            sa.Column('signature_header', sa.String(length=128), nullable=True),
            sa.Column('response_summary', sa.Text(), nullable=False),
            sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['channel_id'], ['alert_channels.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['rule_id'], ['reliability_rules.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_alert_deliveries_agency_id', 'alert_deliveries', ['agency_id'])
        op.create_index('ix_alert_deliveries_channel_id', 'alert_deliveries', ['channel_id'])
        op.create_index('ix_alert_deliveries_rule_id', 'alert_deliveries', ['rule_id'])
        op.create_index('ix_alert_deliveries_delivered_at', 'alert_deliveries', ['delivered_at'])
        op.create_index('ix_alert_deliveries_agency_delivered', 'alert_deliveries', ['agency_id', 'delivered_at'])
    else:
        existing_cols = {c['name'] for c in inspector.get_columns('alert_deliveries')}
        if 'attempt_count' not in existing_cols:
            op.add_column('alert_deliveries', sa.Column('attempt_count', sa.Integer(), nullable=False, server_default='1'))
        if 'dispatched_via' not in existing_cols:
            op.add_column('alert_deliveries', sa.Column('dispatched_via', sa.String(length=32), nullable=False, server_default='SYNC'))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'alert_deliveries' in existing_tables:
        op.drop_table('alert_deliveries')
    if 'reliability_rules' in existing_tables:
        op.drop_table('reliability_rules')
    if 'alert_channels' in existing_tables:
        op.drop_table('alert_channels')
    if 'sla_policies' in existing_tables:
        op.drop_table('sla_policies')
