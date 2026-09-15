"""API 测试公共夹具：独立内存数据库 + 最小种子数据。

- 使用 SQLite 内存库（StaticPool 保证同一连接），不触碰真实 app.db；
- get_db 依赖被覆盖到测试会话，接口读写全部落在测试库上；
- 会话级种子：1 本词书 5 词、词典条目（含 strawberry）、1 篇文章 2 题 1 句；
- 每个用例前清空学习/做题记录（卡片、复习流水、阅读记录、错题），保证用例互不影响。
"""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import models  # noqa: E402
from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402

engine = create_engine(
    "sqlite+pysqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def seed_db():
    """建表并写入最小种子数据（会话级，只执行一次）。"""
    Base.metadata.create_all(engine)
    with TestingSession() as db:
        book = models.WordBook(code="test4", name="测试四级", level="cet4", total=5)
        db.add(book)
        db.flush()
        words = [
            ("apple", "n. 苹果"),
            ("banana", "n. 香蕉"),
            ("cat", "n. 猫"),
            ("dog", "n. 狗"),
            ("egg", "n. 鸡蛋"),
        ]
        for i, (w, m) in enumerate(words, 1):
            db.add(models.BookWord(
                book_id=book.id, rank=i, word=w, meaning=m,
                detail_json=json.dumps({"phrases": [{"en": f"{w} out", "zh": f"{w} 短语"}]}, ensure_ascii=False),
            ))
            db.add(models.DictWord(word=w, translation=m, tag="cet4"))
        db.add(models.DictWord(word="strawberry", translation="n. 草莓", tag="cet4"))

        art = models.Article(
            title="Test Article", level="cet4",
            content="This is a test article about apples and bananas.", word_count=9,
        )
        db.add(art)
        db.flush()
        db.add(models.ArticleQuestion(
            article_id=art.id, question="Q1?", options_json='["a","b","c","d"]', answer=1, explanation="e1"))
        db.add(models.ArticleQuestion(
            article_id=art.id, question="Q2?", options_json='["a","b","c","d"]', answer=2, explanation="e2"))
        db.add(models.ArticleSentence(article_id=art.id, en=art.content, zh="这是一个关于苹果和香蕉的测试文章。"))
        db.add(models.SpeakingScenario(
            code="test_airport", title="测试机场", scene="airport", level="beginner",
            description="测试用场景",
        ))
        db.flush()
        db.add(models.SpeakingLine(
            scenario_id=1, ord=0, role="you",
            en="Where is the gate?", zh="登机口在哪里？", tip="gate 登机口",
        ))
        db.commit()
    yield


@pytest.fixture(autouse=True)
def clean_user_tables():
    """每个用例前清空学习/做题记录，保证用例之间互不影响（场景台词为种子数据保留）。"""
    with TestingSession() as db:
        for m in (
            models.Mistake, models.ReadingAttempt, models.ReviewLog, models.Card,
            models.DictationLog, models.BattleLog, models.UserArticle, models.AppSetting,
            models.SpeakingRecord,
        ):
            db.query(m).delete()
        db.commit()
    yield


@pytest.fixture()
def client():
    """TestClient：将 get_db 依赖覆盖到测试数据库会话。"""
    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
