"""应用配置模块。

通过 pydantic-settings 管理配置项，支持环境变量覆盖（前缀 EP_），
例如 EP_DATABASE_URL 可替换数据库连接。
"""
from pathlib import Path

from pydantic_settings import BaseSettings

# backend/ 目录的绝对路径（本文件位于 backend/app/config.py，向上两级）
BACKEND_DIR = Path(__file__).resolve().parents[1]
# 种子数据与 SQLite 数据库所在目录
DATA_DIR = BACKEND_DIR / "data"


class Settings(BaseSettings):
    """全局配置项集合。

    Attributes:
        database_url: SQLAlchemy 数据库连接串，默认为本机 SQLite 文件。
        frontend_dist: 前端构建产物目录，生产模式下由 FastAPI 托管。
    """

    database_url: str = f"sqlite+pysqlite:///{DATA_DIR / 'app.db'}"
    frontend_dist: Path = BACKEND_DIR.parent / "frontend" / "dist"

    model_config = {"env_prefix": "EP_"}


def get_settings() -> Settings:
    """创建并返回全局配置实例。"""
    return Settings()


settings = get_settings()
