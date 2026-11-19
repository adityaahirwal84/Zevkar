"""001_initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-11-02 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade() -> None:
    # 1. Agencies / Organizations
    op.create_table(
        'agencies',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False, unique=True),
        sa.Column('tier', sa.String(length=50), nullable=False, server_default='STARTER'),
        sa.Column('contact_email', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_agencies_slug', 'agencies', ['slug'])

    # 2. Users
    op.create_table(
        'users',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('email', sa.String(length=255), nullable=False, unique=True),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('is_verified', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    # 3. Agency Members (Multi-Tenant Join)
    op.create_table(
        'agency_members',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.String(length=36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False, server_default='MEMBER'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='ACTIVE'),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_agency_member_lookup', 'agency_members', ['agency_id', 'user_id'], unique=True)

    # 4. Clients
    op.create_table(
        'clients',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('company_name', sa.String(length=255), nullable=False),
        sa.Column('industry', sa.String(length=100), nullable=True),
        sa.Column('contact_email', sa.String(length=255), nullable=False),
        sa.Column('contact_phone', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('health_score', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_clients_agency_id', 'clients', ['agency_id'])

    # 5. Integrations
    op.create_table(
        'integrations',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', sa.String(length=36), sa.ForeignKey('clients.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('platform', sa.String(length=50), nullable=False),
        sa.Column('instance_url', sa.String(length=500), nullable=True),
        sa.Column('encrypted_credentials', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='CONNECTED'),
        sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_integrations_agency_id', 'integrations', ['agency_id'])

    # 6. Workflows
    op.create_table(
        'workflows',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', sa.String(length=36), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=True),
        sa.Column('integration_id', sa.String(length=36), sa.ForeignKey('integrations.id', ondelete='SET NULL'), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('platform', sa.String(length=50), nullable=False),
        sa.Column('external_workflow_id', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('health_status', sa.String(length=50), nullable=False, server_default='HEALTHY'),
        sa.Column('consecutive_failures', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_workflows_agency_id', 'workflows', ['agency_id'])

    # 7. Incidents
    op.create_table(
        'incidents',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('agency_id', sa.String(length=36), sa.ForeignKey('agencies.id', ondelete='CASCADE'), nullable=False),
        sa.Column('client_id', sa.String(length=36), sa.ForeignKey('clients.id', ondelete='CASCADE'), nullable=True),
        sa.Column('workflow_id', sa.String(length=36), sa.ForeignKey('workflows.id', ondelete='CASCADE'), nullable=False),
        sa.Column('execution_id', sa.String(length=255), nullable=True),
        sa.Column('error_category', sa.String(length=50), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=False),
        sa.Column('severity', sa.String(length=50), nullable=False, server_default='HIGH'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='OPEN'),
        sa.Column('first_detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_detected_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('occurrence_count', sa.Integer(), nullable=False, server_default='1'),
    )
    op.create_index('ix_incidents_agency_id', 'incidents', ['agency_id'])

    # 8. AI Diagnoses
    op.create_table(
        'ai_diagnoses',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('incident_id', sa.String(length=36), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('error_category', sa.String(length=50), nullable=False),
        sa.Column('severity', sa.String(length=50), nullable=False),
        sa.Column('root_cause', sa.Text(), nullable=False),
        sa.Column('simple_explanation', sa.Text(), nullable=False),
        sa.Column('technical_explanation', sa.Text(), nullable=False),
        sa.Column('recommended_actions', sa.JSON(), nullable=False),
        sa.Column('suggested_recovery', sa.Text(), nullable=False),
        sa.Column('requires_human_approval', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0.95'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 9. Recovery Attempts
    op.create_table(
        'recovery_attempts',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('incident_id', sa.String(length=36), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('action', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='SUCCESS'),
        sa.Column('idempotency_key', sa.String(length=64), nullable=False, unique=True),
        sa.Column('execution_response', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )

    # 10. Recovery Approvals
    op.create_table(
        'recovery_approvals',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('incident_id', sa.String(length=36), sa.ForeignKey('incidents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('proposed_action', sa.Text(), nullable=False),
        sa.Column('risk_reason', sa.Text(), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='PENDING'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
    )

def downgrade() -> None:
    op.drop_table('recovery_approvals')
    op.drop_table('recovery_attempts')
    op.drop_table('ai_diagnoses')
    op.drop_table('incidents')
    op.drop_table('workflows')
    op.drop_table('integrations')
    op.drop_table('clients')
    op.drop_table('agency_members')
    op.drop_table('users')
    op.drop_table('agencies')
