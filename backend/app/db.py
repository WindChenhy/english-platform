"""数据库连接与会话管理模块。"""
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

# 全局数据库引擎；SQLite 需关闭同线程检查以配合 FastAPI 的线程池
engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)

# 会话工厂：不自动 flush，提交后不过期（便于响应序列化）
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """所有 ORM 模型的公共声明基类。"""


def get_db():
    """FastAPI 依赖：提供一个请求级数据库会话，请求结束后自动关闭。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
