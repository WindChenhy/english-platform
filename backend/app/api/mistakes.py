"""错题本接口：列表与重练。"""
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import PracticeRequest

router = APIRouter(prefix="/api/mistakes", tags=["mistakes"])


@router.get("")
def list_mistakes(resolved: bool = False, db: Session = Depends(get_db)):
    """列出错题（默认未解决），联表返回题干、选项与文章信息。"""
    rows = db.execute(
        select(models.Mistake, models.ArticleQuestion, models.Article)
        .join(models.ArticleQuestion, models.ArticleQuestion.id == models.Mistake.question_id)
        .join(models.Article, models.Article.id == models.Mistake.article_id)
        .where(models.Mistake.resolved == resolved)
        .order_by(models.Mistake.created_at.desc())
    ).all()
    return [{
        "id": m.id,
        "user_answer": m.user_answer,
        "created_at": str(m.created_at),
        "resolved": m.resolved,
        "question": {
            "id": q.id,
            "question": q.question,
            "options": json.loads(q.options_json),
            "answer": q.answer,
            "explanation": q.explanation or "",
        },
        "article": {"id": a.id, "title": a.title},
    } for m, q, a in rows]


@router.post("/{question_id}/practice")
def practice(question_id: int, req: PracticeRequest, db: Session = Depends(get_db)):
    """重练一道错题：答对则把该题所有未解决的错题记录置为已解决。"""
    q = db.get(models.ArticleQuestion, question_id)
    if q is None:
        raise HTTPException(404, "题目不存在")
    ok = req.choice is not None and req.choice == q.answer
    if ok:
        now = datetime.now()
        for m in db.scalars(select(models.Mistake).where(
                models.Mistake.question_id == question_id, models.Mistake.resolved.is_(False))):
            m.resolved = True
            m.resolved_at = now
        db.commit()
    return {"correct": ok, "answer": q.answer, "explanation": q.explanation or ""}
