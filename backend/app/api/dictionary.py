"""词典查询接口（ECDICT 本地库）。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


@router.get("/search")
def search(
    q: str = Query(min_length=1, max_length=64),
    limit: int = Query(default=20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """前缀/包含模糊搜词，按词频与词典序排序，供全局搜索框使用。"""
    kw = q.strip().lower()
    if not kw:
        return {"items": []}
    like_prefix = f"{kw}%"
    like_any = f"%{kw}%"
    stmt = (
        select(models.DictWord)
        .where(or_(models.DictWord.word.like(like_prefix), models.DictWord.word.like(like_any)))
        .order_by(
            (models.DictWord.word.not_like(like_prefix)),
            models.DictWord.frq.is_(None),
            models.DictWord.frq.asc(),
            models.DictWord.word.asc(),
        )
        .limit(limit)
    )
    items = [{
        "word": d.word,
        "phonetic": d.phonetic,
        "translation": (d.translation or "")[:120],
        "tag": d.tag,
    } for d in db.scalars(stmt)]
    return {"items": items}


@router.get("/{word}")
def lookup(word: str, db: Session = Depends(get_db)):
    """查询单个单词的音标与中英释义，供阅读页点词查词使用。"""
    w = word.strip().lower()
    if not w:
        raise HTTPException(400, "词语为空")
    dw = db.get(models.DictWord, w)
    if dw is None:
        raise HTTPException(404, f"词典中没有 {w}")
    return {
        "word": dw.word,
        "phonetic": dw.phonetic,
        "translation": dw.translation,
        "definition": dw.definition,
        "tag": dw.tag,
    }
