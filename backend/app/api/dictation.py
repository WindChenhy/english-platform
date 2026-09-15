"""默写拼写接口：出题范围概览与三种模式的随机出题。"""
import json
import random

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import DictationQuizRequest

router = APIRouter(prefix="/api/dictation", tags=["dictation"])


def _phrases_of_book(db: Session, book_id: int | None) -> list[dict]:
    """从词书词条的 detail_json 中抽取全部可出题短语；book_id 为 None 时抽全部词书。

    Returns:
        元素形如 {"prompt": 中文, "answer": 英文短语, "source": 所属词条}。
    """
    q = select(models.BookWord.book_id, models.BookWord.word, models.BookWord.detail_json).where(
        models.BookWord.detail_json.is_not(None)
    )
    if book_id:
        q = q.where(models.BookWord.book_id == book_id)
    out: list[dict] = []
    for _bid, word, detail_json in db.execute(q).all():
        try:
            detail = json.loads(detail_json)
        except (TypeError, ValueError):
            continue
        for p in detail.get("phrases") or []:
            en = (p.get("en") or "").strip()
            zh = (p.get("zh") or "").strip()
            if not (2 <= len(en) <= 80) or not zh:
                continue
            out.append({"prompt": zh, "answer": en, "source": word})
    return out


def _phrase_counts(db: Session) -> dict[int, int]:
    """单次扫描统计各词书的可出题短语数，供 overview 使用（避免逐词书重复扫描）。"""
    counts: dict[int, int] = {}
    rows = db.execute(
        select(models.BookWord.book_id, models.BookWord.detail_json).where(
            models.BookWord.detail_json.is_not(None)
        )
    ).all()
    for bid, detail_json in rows:
        try:
            detail = json.loads(detail_json)
        except (TypeError, ValueError):
            continue
        n = sum(
            1
            for p in detail.get("phrases") or []
            if p.get("en") and p.get("zh") and 2 <= len(p["en"].strip()) <= 80
        )
        counts[bid] = counts.get(bid, 0) + n
    return counts


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    """默写模块概览：各词书短语数、各级别句子数、生词本词数，供出题设置页展示。"""
    phrase_by_book = {str(bid): n for bid, n in _phrase_counts(db).items()}

    sentence_by_level = {
        level: count
        for level, count in db.execute(
            select(models.Article.level, func.count())
            .join(models.ArticleSentence, models.ArticleSentence.article_id == models.Article.id)
            .group_by(models.Article.level)
        ).all()
    }
    wordlist_count = db.scalar(
        select(func.count()).select_from(models.Card).where(models.Card.source == "wordlist")
    ) or 0
    return {
        "phrase_by_book": phrase_by_book,
        "sentence_by_level": sentence_by_level,
        "wordlist_count": wordlist_count,
    }


@router.post("/quiz")
def quiz(req: DictationQuizRequest, db: Session = Depends(get_db)):
    """随机抽出一组默写题。

    - word：词书随机词条或生词本卡片，prompt 为中文释义；
    - phrase：词书短语库随机抽取，prompt 为中文短语释义；
    - sentence：文章原句随机抽取，prompt 为中文译文，并附文章标题。

    出题项直接携带答案，判分在前端完成（见 frontend/src/grade.ts）。
    """
    items: list[dict] = []

    if req.kind == "word":
        if req.source == "wordlist":
            cards = db.scalars(
                select(models.Card)
                .where(models.Card.source == "wordlist")
                .order_by(func.random())
                .limit(req.count)
            ).all()
            for c in cards:
                items.append({"id": f"card-{c.id}", "prompt": c.meaning, "answer": c.word})
        else:
            if not req.book_id:
                raise HTTPException(400, "词书默写需要选择词书")
            rows = db.scalars(
                select(models.BookWord)
                .where(models.BookWord.book_id == req.book_id)
                .order_by(func.random())
                .limit(req.count)
            ).all()
            for bw in rows:
                items.append({"id": f"bw-{bw.id}", "prompt": bw.meaning, "answer": bw.word})

    elif req.kind == "phrase":
        pool = _phrases_of_book(db, req.book_id)
        random.shuffle(pool)
        for i, p in enumerate(pool[: req.count]):
            items.append({"id": f"phrase-{i}-{p['source']}", **p})

    else:  # sentence
        q = (
            select(models.ArticleSentence, models.Article.title)
            .join(models.Article, models.Article.id == models.ArticleSentence.article_id)
        )
        if req.level:
            q = q.where(models.Article.level == req.level)
        rows = db.execute(q.order_by(func.random()).limit(req.count)).all()
        for s, title in rows:
            items.append({"id": f"sent-{s.id}", "prompt": s.zh, "answer": s.en, "source": title})

    if not items:
        raise HTTPException(404, "该范围内没有可默写的内容")
    return {"items": items}
