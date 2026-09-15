"""add fsrs fields, goals, logs, user articles

Revision ID: a1b2c3d4e5f6
Revises: 739e29614dbd
Create Date: 2026-09-20 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '739e29614dbd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('card', sa.Column('stability', sa.Float(), nullable=True))
    op.add_column('card', sa.Column('difficulty', sa.Float(), nullable=True))
    op.add_column('card', sa.Column('state', sa.String(length=16), nullable=False, server_default='new'))
    op.add_column('card', sa.Column('last_review_date', sa.Date(), nullable=True))
    op.add_column('card', sa.Column('suspended_until', sa.Date(), nullable=True))
    op.add_column('card', sa.Column('buried_until', sa.Date(), nullable=True))
    op.add_column('card', sa.Column('lapses_window', sa.Integer(), nullable=False, server_default='0'))
    op.create_index(op.f('ix_card_suspended_until'), 'card', ['suspended_until'], unique=False)
    op.create_index(op.f('ix_card_buried_until'), 'card', ['buried_until'], unique=False)

    op.create_table(
        'user_article',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('word_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'dictation_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('answer', sa.String(length=200), nullable=False),
        sa.Column('correct', sa.Boolean(), nullable=False),
        sa.Column('word', sa.String(length=64), nullable=True),
        sa.Column('study_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_dictation_log_correct'), 'dictation_log', ['correct'], unique=False)
    op.create_index(op.f('ix_dictation_log_word'), 'dictation_log', ['word'], unique=False)
    op.create_index(op.f('ix_dictation_log_study_date'), 'dictation_log', ['study_date'], unique=False)

    op.create_table(
        'battle_log',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('difficulty', sa.String(length=16), nullable=False),
        sa.Column('result', sa.String(length=8), nullable=False),
        sa.Column('user_correct', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_rounds', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('avg_seconds', sa.Float(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column('study_date', sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_battle_log_result'), 'battle_log', ['result'], unique=False)
    op.create_index(op.f('ix_battle_log_study_date'), 'battle_log', ['study_date'], unique=False)

    op.create_table(
        'app_setting',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )


def downgrade() -> None:
    op.drop_table('app_setting')
    op.drop_index(op.f('ix_battle_log_study_date'), table_name='battle_log')
    op.drop_index(op.f('ix_battle_log_result'), table_name='battle_log')
    op.drop_table('battle_log')
    op.drop_index(op.f('ix_dictation_log_study_date'), table_name='dictation_log')
    op.drop_index(op.f('ix_dictation_log_word'), table_name='dictation_log')
    op.drop_index(op.f('ix_dictation_log_correct'), table_name='dictation_log')
    op.drop_table('dictation_log')
    op.drop_table('user_article')
    op.drop_index(op.f('ix_card_buried_until'), table_name='card')
    op.drop_index(op.f('ix_card_suspended_until'), table_name='card')
    op.drop_column('card', 'lapses_window')
    op.drop_column('card', 'buried_until')
    op.drop_column('card', 'suspended_until')
    op.drop_column('card', 'last_review_date')
    op.drop_column('card', 'state')
    op.drop_column('card', 'difficulty')
    op.drop_column('card', 'stability')
