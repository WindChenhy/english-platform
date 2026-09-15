"""阅读理解接口：文章列表、详情、提交判分，以及用户自贴材料。"""
import json
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import ArticleSubmitRequest, UserArticleRequest

router = APIRouter(prefix="/api/articles", tags=["articles"])


@router.get("")
def list_articles(
    level: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    """列出文章（可按难度/类别过滤），附每篇的练习次数与最好成绩。

    - category=graded：分级阅读；
    - category=exam：考试题型训练（真题题型材料）。
    """
    q = select(models.Article)
    if level:
        q = q.where(models.Article.level == level)
    if category:
        q = q.where(models.Article.category == category)
    arts = db.scalars(q.order_by(models.Article.level, models.Article.id)).all()
    agg = {
        article_id: (count, best)
        for article_id, count, best in db.execute(
            select(
                models.ReadingAttempt.article_id,
                func.count(),
                func.max(models.ReadingAttempt.correct * 1.0 / models.ReadingAttempt.total),
            ).group_by(models.ReadingAttempt.article_id)
        ).all()
    }
    return [{
        "id": a.id,
        "title": a.title,
        "level": a.level,
        "category": a.category,
        "exam_label": a.exam_label,
        "word_count": a.word_count,
        "attempt_count": agg.get(a.id, (0, None))[0],
        "best_score": agg.get(a.id, (0, None))[1],
    } for a in arts]


@router.get("/{article_id}")
def get_article(article_id: int, db: Session = Depends(get_db)):
    """获取文章详情：正文 + 理解题（不带答案）+ 历史做题记录。"""
    art = db.get(models.Article, article_id)
    if art is None:
        raise HTTPException(404, "文章不存在")
    questions = db.scalars(
        select(models.ArticleQuestion).where(models.ArticleQuestion.article_id == article_id)
    ).all()
    attempts = db.scalars(
        select(models.ReadingAttempt)
        .where(models.ReadingAttempt.article_id == article_id)
        .order_by(models.ReadingAttempt.created_at.desc())
    ).all()
    return {
        "id": art.id,
        "title": art.title,
        "level": art.level,
        "category": art.category,
        "exam_label": art.exam_label,
        "content": art.content,
        "word_count": art.word_count,
        "questions": [{
            "id": q.id,
            "question": q.question,
            "options": json.loads(q.options_json),
        } for q in questions],
        "attempts": [{"correct": a.correct, "total": a.total, "created_at": str(a.created_at)}
                     for a in attempts],
    }


@router.post("/{article_id}/submit")
def submit_article(article_id: int, req: ArticleSubmitRequest, db: Session = Depends(get_db)):
    """提交整篇文章的作答：逐题判分、写做题记录，错题自动收进错题本。

    判分口径：未作答的题按答错处理；同一题已有未解决错题时不重复入库。
    """
    art = db.get(models.Article, article_id)
    if art is None:
        raise HTTPException(404, "文章不存在")
    questions = db.scalars(
        select(models.ArticleQuestion).where(models.ArticleQuestion.article_id == article_id)
    ).all()
    answers = {a.question_id: a.choice for a in req.answers}

    results = []
    correct = 0
    for q in questions:
        choice = answers.get(q.id)
        ok = choice is not None and choice == q.answer
        correct += ok
        results.append({
            "question_id": q.id,
            "choice": choice,
            "correct": ok,
            "answer": q.answer,
            "explanation": q.explanation or "",
        })
        if not ok and choice is not None:
            # 只有"确实作答且答错"才收进错题本；漏答的题计 0 分但不入库
            dup = db.scalar(select(models.Mistake).where(
                models.Mistake.question_id == q.id, models.Mistake.resolved.is_(False)))
            if dup is None:
                db.add(models.Mistake(
                    question_id=q.id, article_id=article_id, user_answer=choice,
                ))
    db.add(models.ReadingAttempt(article_id=article_id, correct=correct, total=len(questions)))
    db.commit()
    return {"correct": correct, "total": len(questions), "results": results}


# ---------- 用户自贴阅读材料 ----------


@router.get("/user/list")
def list_user_articles(db: Session = Depends(get_db)):
    """列出用户自贴文章。"""
    rows = db.scalars(select(models.UserArticle).order_by(models.UserArticle.id.desc())).all()
    return [{
        "id": a.id,
        "title": a.title,
        "word_count": a.word_count,
        "created_at": str(a.created_at),
    } for a in rows]


@router.post("/user")
def create_user_article(req: UserArticleRequest, db: Session = Depends(get_db)):
    """保存用户粘贴的英文材料，自动统计词数。"""
    content = req.content.strip()
    words = re.findall(r"[A-Za-z']+", content)
    art = models.UserArticle(title=req.title.strip(), content=content, word_count=len(words))
    db.add(art)
    db.commit()
    return {"id": art.id, "title": art.title, "word_count": art.word_count}


@router.get("/user/{article_id}")
def get_user_article(article_id: int, db: Session = Depends(get_db)):
    """获取自贴文章详情（无理解题，仅点词查词）。"""
    art = db.get(models.UserArticle, article_id)
    if art is None:
        raise HTTPException(404, "文章不存在")
    return {
        "id": art.id,
        "title": art.title,
        "content": art.content,
        "word_count": art.word_count,
        "created_at": str(art.created_at),
    }


@router.delete("/user/{article_id}")
def delete_user_article(article_id: int, db: Session = Depends(get_db)):
    """删除一篇自贴文章。"""
    art = db.get(models.UserArticle, article_id)
    if art is None:
        raise HTTPException(404, "文章不存在")
    db.delete(art)
    db.commit()
    return {"deleted": True}
