"""学习统计接口：仪表盘统计、图表数据、备份导出与导入恢复。"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db

router = APIRouter(tags=["stats"])


@router.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    """首页仪表盘统计：今日学习量、待复习数、连续打卡、词汇量估算与阅读进度。"""
    today = date.today()

    def count(stmt) -> int:
        """对给定 select 语句执行计数的小工具函数。"""
        return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    new_today = db.scalar(select(func.count()).select_from(models.ReviewLog).where(
        models.ReviewLog.study_date == today, models.ReviewLog.kind == "new")) or 0
    review_today = db.scalar(select(func.count()).select_from(models.ReviewLog).where(
        models.ReviewLog.study_date == today, models.ReviewLog.kind == "review")) or 0
    due_today = count(select(models.Card).where(models.Card.due <= today))
    vocab_estimate = count(select(models.Card).where(models.Card.interval >= 21))
    wordlist_count = count(select(models.Card).where(models.Card.source == "wordlist"))

    # 连续打卡：从今天（或昨天）往前数有学习记录的连续天数
    dates = {d for (d,) in db.execute(select(models.ReviewLog.study_date).distinct()).all()}
    streak = 0
    cur = today if today in dates else today - timedelta(days=1)
    while cur in dates:
        streak += 1
        cur -= timedelta(days=1)

    attempts, correct_sum, total_sum, articles_done = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(models.ReadingAttempt.correct), 0),
            func.coalesce(func.sum(models.ReadingAttempt.total), 0),
            func.count(func.distinct(models.ReadingAttempt.article_id)),
        )
    ).one()
    articles_total = db.scalar(select(func.count()).select_from(models.Article)) or 0

    return {
        "new_today": new_today,
        "review_today": review_today,
        "due_today": due_today,
        "streak_days": streak,
        "vocab_estimate": vocab_estimate,
        "wordlist_count": wordlist_count,
        "reading": {
            "articles_done": articles_done,
            "articles_total": articles_total,
            "attempt_count": attempts,
            "accuracy": round(correct_sum / total_sum, 3) if total_sum else None,
        },
    }


@router.get("/api/stats/charts")
def charts(db: Session = Depends(get_db)):
    """统计图表页数据：每日学习量、词汇增长曲线、打卡热力图、到期预测。

    - daily：近 30 天的新学/复习量（缺失日期补 0）；
    - cumulative：按建卡日期累加的词汇总量曲线；
    - heatmap：全部历史日期的每日学习次数（打卡热力图）；
    - forecast：未来 14 天每天到期的卡片数，今天包含全部逾期卡。
    """
    today = date.today()

    daily_rows = db.execute(
        select(models.ReviewLog.study_date, models.ReviewLog.kind, func.count())
        .where(models.ReviewLog.study_date >= today - timedelta(days=29))
        .group_by(models.ReviewLog.study_date, models.ReviewLog.kind)
    ).all()
    dm = {(d, k): n for d, k, n in daily_rows}
    daily = []
    for i in range(30):
        d = today - timedelta(days=29 - i)
        daily.append({
            "date": str(d),
            "new": dm.get((d, "new"), 0),
            "review": dm.get((d, "review"), 0),
        })

    created_rows = db.execute(
        select(func.date(models.Card.created_at), func.count())
        .group_by(func.date(models.Card.created_at))
        .order_by(func.date(models.Card.created_at))
    ).all()
    cumulative = []
    total = 0
    for d, n in created_rows:
        total += n
        cumulative.append({"date": str(d), "total": total})

    heat_rows = db.execute(
        select(models.ReviewLog.study_date, func.count()).group_by(models.ReviewLog.study_date)
    ).all()
    heatmap = [{"date": str(d), "n": n} for d, n in heat_rows]

    fc_rows = db.execute(
        select(models.Card.due, func.count())
        .where(models.Card.due <= today + timedelta(days=13))
        .group_by(models.Card.due)
    ).all()
    fm = dict(fc_rows)
    overdue = sum(n for d, n in fc_rows if d < today)
    forecast = []
    for i in range(14):
        d = today + timedelta(days=i)
        n = overdue if i == 0 else fm.get(d, 0)
        forecast.append({"date": str(d), "n": n})

    return {
        "daily": daily,
        "cumulative": cumulative,
        "heatmap": heatmap,
        "forecast": forecast,
    }


@router.get("/api/export")
def export(db: Session = Depends(get_db)):
    """导出全部学习数据（v2 格式）为可下载的 JSON 文件。

    v2 变更：携带 version 字段；cards 包含 id/book_id/phonetic/last_review_at、
    mistakes 包含 article_id，保证 /api/import 恢复后外键关联完整。
    """
    data = {
        "version": 2,
        "exported_at": datetime.now().isoformat(),
        "cards": [{
            "id": c.id, "word": c.word, "meaning": c.meaning, "phonetic": c.phonetic,
            "book_id": c.book_id, "source": c.source,
            "ease": c.ease, "interval": c.interval, "reps": c.reps,
            "lapses": c.lapses, "due": str(c.due),
            "created_at": str(c.created_at),
            "last_review_at": str(c.last_review_at) if c.last_review_at else None,
        } for c in db.scalars(select(models.Card)).all()],
        "review_logs": [{
            "card_id": l.card_id, "rating": l.rating, "kind": l.kind,
            "prev_interval": l.prev_interval, "new_interval": l.new_interval,
            "study_date": str(l.study_date),
        } for l in db.scalars(select(models.ReviewLog)).all()],
        "reading_attempts": [{
            "article_id": a.article_id, "correct": a.correct,
            "total": a.total, "created_at": str(a.created_at),
        } for a in db.scalars(select(models.ReadingAttempt)).all()],
        "mistakes": [{
            "question_id": m.question_id, "article_id": m.article_id,
            "user_answer": m.user_answer, "resolved": m.resolved,
            "created_at": str(m.created_at),
        } for m in db.scalars(select(models.Mistake)).all()],
    }
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": 'attachment; filename="english-platform-export.json"'},
    )


@router.post("/api/import")
def import_data(payload: dict, db: Session = Depends(get_db)):
    """从导出的 JSON 备份恢复学习数据（整库覆盖：卡片/复习流水/做题记录/错题）。

    要求 v2 格式（cards 带 id，恢复后复习流水的外键才能对上）。
    全部写入在同一个事务中完成，任一步失败即整体回滚。
    """
    if payload.get("version") != 2:
        raise HTTPException(400, "备份文件版本过旧或格式不符，请重新导出")
    cards = payload.get("cards")
    logs = payload.get("review_logs") or []
    attempts = payload.get("reading_attempts") or []
    mistakes = payload.get("mistakes") or []
    if not isinstance(cards, list) or not cards:
        raise HTTPException(400, "备份中没有卡片数据")

    try:
        # 清空旧记录（顺序：先子表后主表）
        db.execute(delete(models.Mistake))
        db.execute(delete(models.ReadingAttempt))
        db.execute(delete(models.ReviewLog))
        db.execute(delete(models.Card))

        for c in cards:
            db.add(models.Card(
                id=int(c["id"]),
                word=str(c["word"]).strip().lower(),
                meaning=c.get("meaning") or "",
                phonetic=c.get("phonetic"),
                book_id=c.get("book_id"),
                source=c.get("source") or "book",
                ease=float(c.get("ease", 2.5)),
                interval=int(c.get("interval", 0)),
                reps=int(c.get("reps", 0)),
                lapses=int(c.get("lapses", 0)),
                due=date.fromisoformat(c["due"]),
                created_at=datetime.fromisoformat(c["created_at"]) if c.get("created_at") else datetime.now(),
                last_review_at=datetime.fromisoformat(c["last_review_at"]) if c.get("last_review_at") else None,
            ))
        for l in logs:
            db.add(models.ReviewLog(
                card_id=int(l["card_id"]), rating=int(l["rating"]), kind=l["kind"],
                prev_interval=int(l.get("prev_interval", 0)),
                new_interval=int(l.get("new_interval", 0)),
                study_date=date.fromisoformat(l["study_date"]),
            ))
        for a in attempts:
            db.add(models.ReadingAttempt(
                article_id=int(a["article_id"]), correct=int(a["correct"]), total=int(a["total"]),
                created_at=datetime.fromisoformat(a["created_at"]) if a.get("created_at") else datetime.now(),
            ))
        for m in mistakes:
            qid = int(m["question_id"])
            q = db.get(models.ArticleQuestion, qid)
            if q is None:  # 题目已不存在（如文章重导过），跳过该错题
                continue
            db.add(models.Mistake(
                question_id=qid, article_id=int(m.get("article_id") or q.article_id),
                user_answer=int(m.get("user_answer", -1)),
                resolved=bool(m.get("resolved", False)),
                created_at=datetime.fromisoformat(m["created_at"]) if m.get("created_at") else datetime.now(),
            ))
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(400, "备份文件解析失败，已回滚，当前数据未受影响")

    return {
        "cards": len(cards),
        "review_logs": len(logs),
        "reading_attempts": len(attempts),
        "mistakes": len(mistakes),
    }
