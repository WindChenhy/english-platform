"""add exam article fields and speaking tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-21 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('article', sa.Column('category', sa.String(length=16), nullable=False, server_default='graded'))
    op.create_index(op.f('ix_article_category'), 'article', ['category'], unique=False)
    op.add_column('article', sa.Column('exam_label', sa.String(length=64), nullable=True))

    op.create_table(
        'speaking_scenario',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=120), nullable=False),
        sa.Column('scene', sa.String(length=32), nullable=False),
        sa.Column('level', sa.String(length=16), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )
    op.create_index(op.f('ix_speaking_scenario_scene'), 'speaking_scenario', ['scene'], unique=False)

    op.create_table(
        'speaking_line',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scenario_id', sa.Integer(), nullable=False),
        sa.Column('ord', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('en', sa.Text(), nullable=False),
        sa.Column('zh', sa.Text(), nullable=False),
        sa.Column('tip', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['scenario_id'], ['speaking_scenario.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_speaking_line_scenario_id'), 'speaking_line', ['scenario_id'], unique=False)

    op.create_table(
        'speaking_record',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('scenario_id', sa.Integer(), nullable=True),
        sa.Column('line_id', sa.Integer(), nullable=True),
        sa.Column('target_text', sa.Text(), nullable=False),
        sa.Column('transcript', sa.Text(), nullable=False),
        sa.Column('score', sa.Float(), nullable=False),
        sa.Column('audio_path', sa.String(length=255), nullable=True),
        sa.Column('duration_ms', sa.Integer(), nullable=False),
        sa.Column('study_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['scenario_id'], ['speaking_scenario.id']),
        sa.ForeignKeyConstraint(['line_id'], ['speaking_line.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_speaking_record_scenario_id'), 'speaking_record', ['scenario_id'], unique=False)
    op.create_index(op.f('ix_speaking_record_line_id'), 'speaking_record', ['line_id'], unique=False)
    op.create_index(op.f('ix_speaking_record_study_date'), 'speaking_record', ['study_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_speaking_record_study_date'), table_name='speaking_record')
    op.drop_index(op.f('ix_speaking_record_line_id'), table_name='speaking_record')
    op.drop_index(op.f('ix_speaking_record_scenario_id'), table_name='speaking_record')
    op.drop_table('speaking_record')
    op.drop_index(op.f('ix_speaking_line_scenario_id'), table_name='speaking_line')
    op.drop_table('speaking_line')
    op.drop_index(op.f('ix_speaking_scenario_scene'), table_name='speaking_scenario')
    op.drop_table('speaking_scenario')
    op.drop_column('article', 'exam_label')
    op.drop_index(op.f('ix_article_category'), table_name='article')
    op.drop_column('article', 'category')
