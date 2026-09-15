"""背单词核心接口：今日学习队列、复习结算（FSRS）、生词本、卡片管理、弱项训练。"""
import json
import random
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models, srs
from ..db import get_db
from ..schemas import CardActionRequest, ReviewRequest, WordlistRequest

router = APIRouter(prefix="/api/study", tags=["study"])


def _active_card_filter(today: date):
    """排除挂起/埋藏中的卡片。"""
    return or_(
        models.Card.suspended_until.is_(None),
        models.Card.suspended_until < today,
    ), or_(
        models.Card.buried_until.is_(None),
        models.Card.buried_until < today,
    )


@router.get("/queue")
def study_queue(
    book_id: int | None = None,
    new_limit: int = Query(default=10, ge=0, le=50),
    direction: str = "e2c",
    review_limit: int = Query(default=60, ge=1, le=200),
    mode: str = Query(default="normal", pattern="^(normal|weak)$"),
    db: Session = Depends(get_db),
):
    """今日学习队列：到期复习卡 + 词书新词，新词穿插在复习之间。

    - mode=weak：只出弱项卡（lapses>=1 或近期默写/对战常错）；
    - 挂起/埋藏中的卡不出现在队列。
    """
    if direction not in ("e2c", "c2e", "mixed"):
        raise HTTPException(400, "direction 取值无效")
    today = date.today()
    susp_ok, bury_ok = _active_card_filter(today)

    review_items = []
    q = select(models.Card).where(susp_ok, bury_ok)
    if mode == "weak":
        q = q.where(or_(models.Card.lapses >= 1, models.Card.lapses_window >= 1))
    else:
        q = q.where(models.Card.due <= today)
    if book_id:
        q = q.where(models.Card.book_id == book_id)
    for c in db.scalars(q.order_by(models.Card.due, models.Card.id).limit(review_limit)):
        review_items.append({
            "type": "review",
            "card_id": c.id,
            "word": c.word,
            "phonetic": c.phonetic,
            "meaning": c.meaning,
            "lapses": c.lapses,
        })

    new_items = []
    if book_id and new_limit > 0 and mode != "weak":
        rows = db.scalars(
            select(models.BookWord)
            .outerjoin(models.Card, models.Card.word == models.BookWord.word)
            .where(models.BookWord.book_id == book_id, models.Card.id.is_(None))
            .order_by(models.BookWord.rank)
            .limit(new_limit)
        ).all()
        pool = db.scalars(
            select(models.BookWord.meaning)
            .where(models.BookWord.book_id == book_id)
            .order_by(func.random())
            .limit(100)
        ).all()
        word_pool = (
            db.scalars(
                select(models.BookWord.word)
                .where(models.BookWord.book_id == book_id)
                .order_by(func.random())
                .limit(80)
            ).all()
            if direction != "e2c"
            else []
        )
        for bw in rows:
            quiz = direction if direction != "mixed" else random.choice(["e2c", "c2e"])
            if quiz == "c2e":
                options = [bw.word]
                for w in word_pool:
                    if len(options) >= 4:
                        break
                    if w != bw.word and w not in options:
                        options.append(w)
                random.shuffle(options)
            else:
                options = [bw.meaning]
                for m in pool:
                    if len(options) >= 4:
                        break
                    if m != bw.meaning and m not in options:
                        options.append(m)
                random.shuffle(options)
            new_items.append({
                "type": "new",
                "quiz": quiz,
                "word": bw.word,
                "book_id": book_id,
                "phonetic_us": bw.phonetic_us,
                "phonetic_uk": bw.phonetic_uk,
                "meaning": bw.meaning,
                "options": options,
                "detail": json.loads(bw.detail_json) if bw.detail_json else None,
            })

    items: list[dict] = []
    if not review_items:
        items = new_items
    else:
        new_iter = iter(new_items)
        for i, r in enumerate(review_items):
            items.append(r)
            if (i + 1) % 3 == 0:
                n = next(new_iter, None)
                if n:
                    items.append(n)
        items.extend(new_iter)

    return {"items": items, "counts": {"review": len(review_items), "new": len(new_items)}}


@router.post("/review")
def submit_review(req: ReviewRequest, db: Session = Depends(get_db)):
    """提交一次作答并按 FSRS 结算：写复习流水，返回结算后的卡片状态。"""
    today = date.today()
    word = req.word.strip().lower()
    card = db.scalar(select(models.Card).where(models.Card.word == word))

    if req.kind == "new":
        if card:
            prev_interval = card.interval
        else:
            bw = db.scalar(select(models.BookWord).where(
                models.BookWord.book_id == req.book_id, models.BookWord.word == word))
            if bw is None:
                raise HTTPException(404, f"词书 {req.book_id} 中没有 {word}")
            card = models.Card(
                word=word,
                meaning=bw.meaning,
                phonetic=bw.phonetic_us or bw.phonetic_uk,
                book_id=req.book_id,
                source="book",
                due=today,
                state="new",
            )
            db.add(card)
            db.flush()
            prev_interval = 0
        kind = "new"
    else:
        if card is None:
            raise HTTPException(404, f"没有 {word} 的复习卡")
        prev_interval = card.interval
        kind = "review"

    srs.apply_review(card, req.rating, today)
    card.last_review_at = datetime.now()
    db.add(models.ReviewLog(
        card_id=card.id, rating=req.rating, kind=kind,
        prev_interval=prev_interval, new_interval=card.interval, study_date=today,
    ))
    db.commit()
    return {
        "word": card.word, "rating": req.rating, "kind": kind,
        "interval": card.interval, "due": str(card.due), "ease": round(card.ease, 2),
        "stability": round(card.stability or 0, 2),
        "difficulty": round(card.difficulty or 0, 2),
        "state": card.state,
    }


# ---------- 生词本 ----------


@router.get("/wordlist")
def list_wordlist(
    q: str | None = None,
    sort: str = Query(default="created", pattern="^(created|due|interval|lapses|word)$"),
    db: Session = Depends(get_db),
):
    """列出生词本；支持关键词搜索与多字段排序。"""
    stmt = select(models.Card).where(models.Card.source == "wordlist")
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            models.Card.word.like(like),
            models.Card.meaning.like(like),
        ))
    order = {
        "created": models.Card.created_at.desc(),
        "due": models.Card.due.asc(),
        "interval": models.Card.interval.desc(),
        "lapses": models.Card.lapses.desc(),
        "word": models.Card.word.asc(),
    }[sort]
    cards = db.scalars(stmt.order_by(order)).all()
    return [{
        "id": c.id, "word": c.word, "meaning": c.meaning, "phonetic": c.phonetic,
        "interval": c.interval, "due": str(c.due), "lapses": c.lapses,
        "state": c.state,
    } for c in cards]


@router.post("/wordlist")
def add_to_wordlist(req: WordlistRequest, db: Session = Depends(get_db)):
    """收藏生词：从 ECDICT 建卡并设为今日到期，立即进入复习队列。"""
    today = date.today()
    word = req.word.strip().lower()
    if not word:
        raise HTTPException(400, "词语为空")
    card = db.scalar(select(models.Card).where(models.Card.word == word))
    if card:
        moved = False
        if card.due > today:
            card.due = today
            moved = True
        db.commit()
        return {"created": False, "moved_into_today": moved,
                "word": card.word, "meaning": card.meaning}

    dw = db.get(models.DictWord, word)
    if dw is None:
        raise HTTPException(404, f"词典中没有 {word}")
    translation = (dw.translation or dw.definition or "").replace("\\n", "；").strip()
    meaning = translation.split("；")[0][:200]
    card = models.Card(
        word=word, meaning=meaning or word, phonetic=dw.phonetic,
        book_id=None, source="wordlist", due=today, state="new",
    )
    db.add(card)
    db.commit()
    return {"created": True, "moved_into_today": False,
            "word": card.word, "meaning": card.meaning}


@router.delete("/wordlist/{word}")
def remove_from_wordlist(word: str, db: Session = Depends(get_db)):
    """从生词本删除一个词（连同其复习记录）。"""
    card = db.scalar(select(models.Card).where(
        models.Card.word == word.strip().lower(), models.Card.source == "wordlist"))
    if card is None:
        raise HTTPException(404, "生词本中没有该词")
    db.delete(card)
    db.commit()
    return {"deleted": True}


# ---------- 卡片管理：挂起 / 埋藏 ----------


def _set_card_hold(word: str, field: str, days: int, db: Session) -> models.Card:
    """把卡片的 suspended_until / buried_until 设为 today+days-1（含当天）。"""
    card = db.scalar(select(models.Card).where(models.Card.word == word.strip().lower()))
    if card is None:
        raise HTTPException(404, f"没有 {word} 的卡片")
    until = date.today() + timedelta(days=days - 1)
    setattr(card, field, until)
    db.commit()
    return card


@router.post("/cards/{word}/suspend")
def suspend_card(word: str, req: CardActionRequest, db: Session = Depends(get_db)):
    """挂起卡片：指定天数内不进入复习队列。"""
    card = _set_card_hold(word, "suspended_until", req.days, db)
    return {"word": card.word, "suspended_until": str(card.suspended_until)}


@router.post("/cards/{word}/bury")
def bury_card(word: str, req: CardActionRequest, db: Session = Depends(get_db)):
    """埋藏卡片：通常埋 1 天，避开今日队列。"""
    card = _set_card_hold(word, "buried_until", req.days, db)
    return {"word": card.word, "buried_until": str(card.buried_until)}


@router.post("/cards/{word}/unsuspend")
def unsuspend_card(word: str, db: Session = Depends(get_db)):
    """解除挂起/埋藏，立即恢复可调度。"""
    card = db.scalar(select(models.Card).where(models.Card.word == word.strip().lower()))
    if card is None:
        raise HTTPException(404, f"没有 {word} 的卡片")
    card.suspended_until = None
    card.buried_until = None
    db.commit()
    return {"word": card.word, "active": True}


@router.get("/cards/{word}")
def get_card(word: str, db: Session = Depends(get_db)):
    """查看单张卡片状态（预览）。"""
    card = db.scalar(select(models.Card).where(models.Card.word == word.strip().lower()))
    if card is None:
        raise HTTPException(404, f"没有 {word} 的卡片")
    today = date.today()
    return {
        "word": card.word,
        "meaning": card.meaning,
        "phonetic": card.phonetic,
        "interval": card.interval,
        "due": str(card.due),
        "ease": round(card.ease, 2),
        "stability": round(card.stability or 0, 2),
        "difficulty": round(card.difficulty or 0, 2),
        "state": card.state,
        "lapses": card.lapses,
        "reps": card.reps,
        "source": card.source,
        "suspended": bool(card.suspended_until and card.suspended_until >= today),
        "buried": bool(card.buried_until and card.buried_until >= today),
    }
