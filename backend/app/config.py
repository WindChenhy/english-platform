"""应用配置模块。

通过 pydantic-settings 管理配置项，支持环境变量覆盖（前缀 EP_）。

目录约定：
- SEED_DIR：只读种子数据（词书 zip、文章 JSON、口语场景、ECDICT CSV），默认在仓库 backend/data。
- USER_DATA_DIR：可写用户数据（app.db、recordings/），默认在系统应用数据目录。
  Windows: %LOCALAPPDATA%/word-traces
  macOS:   ~/Library/Application Support/word-traces
  Linux:   $XDG_DATA_HOME/word-traces 或 ~/.local/share/word-traces
可用 EP_USER_DATA_DIR / EP_SEED_DIR / EP_DATABASE_URL 覆盖。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from pydantic_settings import BaseSettings

# backend/ 目录的绝对路径（本文件位于 backend/app/config.py，向上两级）
BACKEND_DIR = Path(__file__).resolve().parents[1]
# 仓库内只读种子数据
SEED_DIR = BACKEND_DIR / "data"

APP_DIR_NAME = "word-traces"


def default_user_data_dir() -> Path:
    """按平台解析系统应用数据目录。"""
    override = os.environ.get("EP_USER_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / APP_DIR_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_DIR_NAME
    base = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(base) / APP_DIR_NAME


class Settings(BaseSettings):
    """全局配置项集合。

    Attributes:
        user_data_dir: 用户可写数据根目录（数据库、录音）。
        seed_dir: 只读种子数据目录。
        database_url: SQLAlchemy 连接串，默认 user_data_dir/app.db。
        frontend_dist: 前端构建产物目录，生产模式下由 FastAPI 托管。
    """

    user_data_dir: Path = default_user_data_dir()
    seed_dir: Path = Path(os.environ.get("EP_SEED_DIR") or SEED_DIR)
    database_url: str = ""
    frontend_dist: Path = BACKEND_DIR.parent / "frontend" / "dist"

    model_config = {"env_prefix": "EP_"}

    def model_post_init(self, __context: object) -> None:
        if not self.database_url:
            object.__setattr__(
                self,
                "database_url",
                f"sqlite+pysqlite:///{self.user_data_dir / 'app.db'}",
            )


def get_settings() -> Settings:
    """创建并返回全局配置实例。"""
    return Settings()


settings = get_settings()

# 兼容旧引用：种子相关代码用 SEED_DIR；用户可写路径用 USER_DATA_DIR。
DATA_DIR = settings.seed_dir
USER_DATA_DIR = settings.user_data_dir


def ensure_user_dirs() -> None:
    """启动时确保用户数据目录存在，并把旧仓库内数据迁到用户目录。"""
    settings.user_data_dir.mkdir(parents=True, exist_ok=True)
    (settings.user_data_dir / "recordings").mkdir(parents=True, exist_ok=True)
    _migrate_legacy_user_data()


def _migrate_legacy_user_data() -> None:
    """若用户目录尚无库、而仓库 backend/data/app.db 仍在，则一次性迁走。"""
    legacy_db = SEED_DIR / "app.db"
    target_db = settings.user_data_dir / "app.db"
    if target_db.is_file() or not legacy_db.is_file():
        return
    try:
        target_db.write_bytes(legacy_db.read_bytes())
    except OSError:
        return
    legacy_rec = SEED_DIR / "recordings"
    target_rec = settings.user_data_dir / "recordings"
    if legacy_rec.is_dir():
        for f in legacy_rec.iterdir():
            if f.is_file():
                dest = target_rec / f.name
                if not dest.exists():
                    try:
                        dest.write_bytes(f.read_bytes())
                    except OSError:
                        pass

