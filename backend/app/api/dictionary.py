"""词典查询接口（ECDICT 本地库）。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db

router = APIRouter(prefix="/api/dictionary", tags=["dictionary"])


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
