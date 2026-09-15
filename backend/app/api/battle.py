"""对战接口：自适应难度建议、战绩落库与历史。"""
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import BattleResultRequest

router = APIRouter(prefix="/api/battle", tags=["battle"])

DIFFS = ["easy", "normal", "hard"]


@router.get("/config")
def battle_config(db: Session = Depends(get_db)):
    """根据近 20 局胜率推荐难度；无战绩时默认 normal。"""
    rows = db.scalars(
        select(models.BattleLog).order_by(models.BattleLog.id.desc()).limit(20)
    ).all()
    if not rows:
        return {"suggested": "normal", "recent": [], "win_rate": None}
    wins = sum(1 for r in rows if r.result == "win")
    draws = sum(1 for r in rows if r.result == "draw")
    win_rate = (wins + draws * 0.5) / len(rows)
    if win_rate >= 0.7:
        suggested = "hard"
    elif win_rate <= 0.35:
        suggested = "easy"
    else:
        suggested = "normal"
    return {
        "suggested": suggested,
        "win_rate": round(win_rate, 3),
        "recent": [{
            "id": r.id,
            "difficulty": r.difficulty,
            "result": r.result,
            "user_correct": r.user_correct,
            "total_rounds": r.total_rounds,
            "avg_seconds": round(r.avg_seconds, 1),
            "created_at": str(r.created_at),
        } for r in rows[:10]],
    }


@router.post("/result")
def save_battle(req: BattleResultRequest, db: Session = Depends(get_db)):
    """保存一局对战：写战绩，并把错词计入弱项。"""
    today = date.today()
    log = models.BattleLog(
        difficulty=req.difficulty,
        result=req.result,
        user_correct=req.user_correct,
        total_rounds=req.total_rounds,
        avg_seconds=req.avg_seconds,
        study_date=today,
    )
    db.add(log)
    for w in req.wrong_words:
        word = w.strip().lower()
        if not word:
            continue
        card = db.scalar(select(models.Card).where(models.Card.word == word))
        if card:
            card.lapses_window += 1
    db.commit()
    return {"id": log.id, "result": log.result}


@router.get("/history")
def battle_history(limit: int = 20, db: Session = Depends(get_db)):
    """对战历史与汇总。"""
    rows = db.scalars(
        select(models.BattleLog).order_by(models.BattleLog.id.desc()).limit(limit)
    ).all()
    total = db.scalar(select(func.count()).select_from(models.BattleLog)) or 0
    wins = db.scalar(select(func.count()).select_from(models.BattleLog).where(
        models.BattleLog.result == "win")) or 0
    return {
        "total": total,
        "wins": wins,
        "items": [{
            "id": r.id,
            "difficulty": r.difficulty,
            "result": r.result,
            "user_correct": r.user_correct,
            "total_rounds": r.total_rounds,
            "avg_seconds": round(r.avg_seconds, 1),
            "created_at": str(r.created_at),
        } for r in rows],
    }
