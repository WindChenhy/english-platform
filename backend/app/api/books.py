"""词书相关接口。"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db

router = APIRouter(prefix="/api/books", tags=["books"])


@router.get("")
def list_books(db: Session = Depends(get_db)):
    """列出全部词书及其学习进度。

    返回字段：基本信息 + learned（已建卡的词数）、mastered（间隔≥21 天的词数）、
    due_now（今日到期的卡数），供背单词页的词书卡片展示。
    """
    today = date.today()
    rows = db.execute(
        select(
            models.WordBook,
            func.count(models.Card.id),
            func.coalesce(func.sum(case((models.Card.interval >= 21, 1), else_=0)), 0),
            func.coalesce(func.sum(case((models.Card.due <= today, 1), else_=0)), 0),
        )
        .join(models.BookWord, models.BookWord.book_id == models.WordBook.id)
        .outerjoin(models.Card, models.Card.word == models.BookWord.word)
        .group_by(models.WordBook.id)
        .order_by(models.WordBook.id)
    ).all()
    return [{
        "id": b.id,
        "code": b.code,
        "name": b.name,
        "level": b.level,
        "total": b.total,
        "learned": learned,
        "mastered": mastered,
        "due_now": due_now,
    } for b, learned, mastered, due_now in rows]
