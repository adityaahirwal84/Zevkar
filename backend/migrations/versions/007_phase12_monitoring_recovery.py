"""007_phase12_monitoring_recovery

Revision ID: 007_phase12_monitoring_recovery
Revises: 006_sla_and_alert_routing
Create Date: 2026-11-19 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '007_phase12_monitoring_recovery'
down_revision = '006_sla_and_alert_routing'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'ai_diagnoses' in existing_tables:
        diag_cols = {c['name'] for c in inspector.get_columns('ai_diagnoses')}
        if 'verified_facts' not in diag_cols:
            op.add_column('ai_diagnoses', sa.Column('verified_facts', sa.JSON(), nullable=True))
        if 'ai_hypotheses' not in diag_cols:
            op.add_column('ai_diagnoses', sa.Column('ai_hypotheses', sa.JSON(), nullable=True))

    if 'recovery_requests' in existing_tables:
        rec_cols = {c['name'] for c in inspector.get_columns('recovery_requests')}
        if 'verification_deadline_at' not in rec_cols:
            op.add_column(
                'recovery_requests',
                sa.Column('verification_deadline_at', sa.DateTime(timezone=True), nullable=True),
            )

    if 'executions' in existing_tables:
        exec_indexes = {idx['name'] for idx in inspector.get_indexes('executions')}
        if 'ix_executions_integration_status' not in exec_indexes:
            op.create_index(
                'ix_executions_integration_status',
                'executions',
                ['integration_id', 'status'],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'executions' in existing_tables:
        exec_indexes = {idx['name'] for idx in inspector.get_indexes('executions')}
        if 'ix_executions_integration_status' in exec_indexes:
            op.drop_index('ix_executions_integration_status', table_name='executions')

    if 'recovery_requests' in existing_tables:
        rec_cols = {c['name'] for c in inspector.get_columns('recovery_requests')}
        if 'verification_deadline_at' in rec_cols:
            op.drop_column('recovery_requests', 'verification_deadline_at')

    if 'ai_diagnoses' in existing_tables:
        diag_cols = {c['name'] for c in inspector.get_columns('ai_diagnoses')}
        if 'ai_hypotheses' in diag_cols:
            op.drop_column('ai_diagnoses', 'ai_hypotheses')
        if 'verified_facts' in diag_cols:
            op.drop_column('ai_diagnoses', 'verified_facts')
