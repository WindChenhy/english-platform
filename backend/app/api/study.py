"""背单词核心接口：今日学习队列、复习结算（SM-2）、生词本。"""
import json
import random
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models, srs
from ..db import get_db
from ..schemas import ReviewRequest, WordlistRequest

router = APIRouter(prefix="/api/study", tags=["study"])


@router.get("/queue")
def study_queue(
    book_id: int | None = None,
    new_limit: int = Query(default=10, ge=1, le=50),
    direction: str = "e2c",  # e2c 看英文选中文 / c2e 看中文选英文 / mixed 混合
    db: Session = Depends(get_db),
):
    """今日学习队列：到期复习卡 + 词书新词，新词穿插在复习之间。

    - 复习项只带词面，客户端翻面后才展示释义（翻面自评）；
    - 新词项按 direction 决定题型：e2c 的 options 为中文释义干扰项，
      c2e 的 options 为同词书随机英文单词干扰项，mixed 逐词随机二选一；
    - 其他词书（或生词本）已学过的词不再作为新词出现（card 全局唯一）。
    """
    if direction not in ("e2c", "c2e", "mixed"):
        raise HTTPException(400, "direction 取值无效")
    today = date.today()

    review_items = []
    q = select(models.Card).where(models.Card.due <= today)
    if book_id:
        q = q.where(models.Card.book_id == book_id)
    for c in db.scalars(q.order_by(models.Card.due, models.Card.id).limit(60)):
        review_items.append({
            "type": "review",
            "card_id": c.id,
            "word": c.word,
            "phonetic": c.phonetic,
            "meaning": c.meaning,
        })

    new_items = []
    if book_id:
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
                # 看中文释义，从同词书随机选 3 个英文单词做干扰项
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

    # 新词穿插在复习之间：每 3 张复习卡插 1 个新词
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
    """提交一次作答并按简化 SM-2 结算：写复习流水，返回结算后的卡片状态。

    - kind=new 时若该词已在其他词书/生词本建过卡，直接复用现有卡结算；
    - kind=new 且无卡时，用词书词条的释义/音标快照建卡（source=book）。
    """
    today = date.today()
    word = req.word.strip().lower()
    card = db.scalar(select(models.Card).where(models.Card.word == word))

    if req.kind == "new":
        if card:
            prev_interval = card.interval  # 其他词书学过同一词，复用已有卡
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
    }


# ---------- 生词本 ----------


@router.get("/wordlist")
def list_wordlist(db: Session = Depends(get_db)):
    """列出生词本（source=wordlist 的卡片），按收藏时间倒序。"""
    cards = db.scalars(
        select(models.Card)
        .where(models.Card.source == "wordlist")
        .order_by(models.Card.created_at.desc())
    ).all()
    return [{
        "id": c.id, "word": c.word, "meaning": c.meaning, "phonetic": c.phonetic,
        "interval": c.interval, "due": str(c.due),
    } for c in cards]


@router.post("/wordlist")
def add_to_wordlist(req: WordlistRequest, db: Session = Depends(get_db)):
    """收藏生词：从 ECDICT 建卡并设为今日到期，立即进入复习队列。

    已收藏的词重复收藏时，仅把到期日提前到今天（moved_into_today=True）。
    """
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
        book_id=None, source="wordlist", due=today,
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
