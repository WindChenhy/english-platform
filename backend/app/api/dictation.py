"""默写拼写接口：出题范围概览、三种模式随机出题、结果落库与弱项词。"""
import json
import random
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import DictationQuizRequest, DictationResultRequest

router = APIRouter(prefix="/api/dictation", tags=["dictation"])


def _iter_valid_phrases(detail_json: str | None) -> list[tuple[str, str]]:
    """从词条 detail_json 解析可出题短语：en 长度 2–80 且有中文释义。

    Returns:
        [(英文短语, 中文释义), ...]
    """
    if not detail_json:
        return []
    try:
        detail = json.loads(detail_json)
    except (TypeError, ValueError):
        return []
    out: list[tuple[str, str]] = []
    for p in detail.get("phrases") or []:
        en = (p.get("en") or "").strip()
        zh = (p.get("zh") or "").strip()
        if 2 <= len(en) <= 80 and zh:
            out.append((en, zh))
    return out


def _phrases_of_book(db: Session, book_id: int | None) -> list[dict]:
    """从词书词条的 detail_json 中抽取全部可出题短语；book_id 为 None 时抽全部词书。

    Returns:
        元素形如 {"prompt": 中文, "answer": 英文短语, "source": 所属词条}。
    """
    q = select(models.BookWord.word, models.BookWord.detail_json).where(
        models.BookWord.detail_json.is_not(None)
    )
    if book_id:
        q = q.where(models.BookWord.book_id == book_id)
    out: list[dict] = []
    for word, detail_json in db.execute(q).all():
        for en, zh in _iter_valid_phrases(detail_json):
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
        counts[bid] = counts.get(bid, 0) + len(_iter_valid_phrases(detail_json))
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
        if req.source == "weak":
            # 弱项：lapses>=1 或近期默写/对战错过的卡片
            cards = db.scalars(
                select(models.Card)
                .where(or_(models.Card.lapses >= 1, models.Card.lapses_window >= 1))
                .order_by(models.Card.lapses.desc(), models.Card.lapses_window.desc())
                .limit(req.count)
            ).all()
            for c in cards:
                items.append({"id": f"weak-{c.id}", "prompt": c.meaning, "answer": c.word})
        elif req.source == "wordlist":
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


@router.post("/result")
def save_result(req: DictationResultRequest, db: Session = Depends(get_db)):
    """提交整场默写结果：写流水，并更新关联卡片的弱项计数。"""
    today = date.today()
    saved = 0
    for it in req.items:
        word = (it.word or "").strip().lower() or None
        if it.kind == "word" and not word:
            word = it.answer.strip().lower()
        db.add(models.DictationLog(
            kind=it.kind,
            answer=it.answer[:200],
            correct=it.correct,
            word=word,
            study_date=today,
        ))
        if word and not it.correct:
            card = db.scalar(select(models.Card).where(models.Card.word == word))
            if card:
                card.lapses_window += 1
        elif word and it.correct:
            card = db.scalar(select(models.Card).where(models.Card.word == word))
            if card and card.lapses_window > 0:
                card.lapses_window = max(0, card.lapses_window - 1)
        saved += 1
    db.commit()
    return {"saved": saved}


@router.get("/stats")
def dictation_stats(days: int = 30, db: Session = Depends(get_db)):
    """近 N 天默写正确率趋势与错词 Top。"""
    today = date.today()
    since = today - timedelta(days=max(0, days - 1))
    rows = db.execute(
        select(models.DictationLog.study_date, models.DictationLog.correct, func.count())
        .where(models.DictationLog.study_date >= since)
        .group_by(models.DictationLog.study_date, models.DictationLog.correct)
    ).all()
    by_day: dict[str, dict[str, int]] = {}
    for d, correct, n in rows:
        key = str(d)
        by_day.setdefault(key, {"correct": 0, "wrong": 0})
        by_day[key]["correct" if correct else "wrong"] += n
    daily = []
    for i in range(days):
        d = str(today - timedelta(days=days - 1 - i))
        daily.append({"date": d, **by_day.get(d, {"correct": 0, "wrong": 0})})

    wrong_words = db.execute(
        select(models.DictationLog.word, models.DictationLog.answer, func.count())
        .where(models.DictationLog.correct.is_(False), models.DictationLog.word.is_not(None))
        .group_by(models.DictationLog.word, models.DictationLog.answer)
        .order_by(func.count().desc())
        .limit(10)
    ).all()
    return {
        "daily": daily,
        "wrong_top": [{"word": w, "answer": a, "n": n} for w, a, n in wrong_words],
    }
