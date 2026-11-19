"""005_onboarding_and_activation

Revision ID: 005_onboarding_and_activation
Revises: 004_intelligent_recovery_engine
Create Date: 2026-11-17 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '005_onboarding_and_activation'
down_revision = '004_intelligent_recovery_engine'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {col['name'] for col in inspector.get_columns('agencies')}

    if 'onboarding_step' not in existing_cols:
        op.add_column('agencies', sa.Column('onboarding_step', sa.Integer(), nullable=False, server_default='1'))
    if 'onboarding_completed' not in existing_cols:
        op.add_column('agencies', sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default=sa.false()))
    if 'onboarding_data' not in existing_cols:
        op.add_column('agencies', sa.Column('onboarding_data', sa.JSON(), nullable=True))
    if 'onboarding_completed_at' not in existing_cols:
        op.add_column('agencies', sa.Column('onboarding_completed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_cols = {col['name'] for col in inspector.get_columns('agencies')}

    if 'onboarding_completed_at' in existing_cols:
        op.drop_column('agencies', 'onboarding_completed_at')
    if 'onboarding_data' in existing_cols:
        op.drop_column('agencies', 'onboarding_data')
    if 'onboarding_completed' in existing_cols:
        op.drop_column('agencies', 'onboarding_completed')
    if 'onboarding_step' in existing_cols:
        op.drop_column('agencies', 'onboarding_step')
