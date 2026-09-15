"""应用设置接口：每日学习目标等键值配置。"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..schemas import GoalsRequest

router = APIRouter(prefix="/api/settings", tags=["settings"])

GOALS_KEY = "daily_goals"
DEFAULT_GOALS = {"daily_new": 10, "daily_review": 60}


def get_goals(db: Session) -> dict:
    """读取每日目标；无配置或 JSON 损坏时返回 DEFAULT_GOALS。"""
    row = db.get(models.AppSetting, GOALS_KEY)
    if not row:
        return dict(DEFAULT_GOALS)
    try:
        data = json.loads(row.value)
        return {
            "daily_new": int(data.get("daily_new", DEFAULT_GOALS["daily_new"])),
            "daily_review": int(data.get("daily_review", DEFAULT_GOALS["daily_review"])),
        }
    except (ValueError, TypeError, json.JSONDecodeError):
        return dict(DEFAULT_GOALS)


def set_goals(db: Session, goals: dict) -> None:
    """写入每日目标并提交事务。"""
    row = db.get(models.AppSetting, GOALS_KEY)
    payload = json.dumps(goals)
    if row:
        row.value = payload
    else:
        db.add(models.AppSetting(key=GOALS_KEY, value=payload))
    db.commit()


@router.get("/goals")
def read_goals(db: Session = Depends(get_db)):
    """读取每日学习目标。"""
    return get_goals(db)


@router.put("/goals")
def write_goals(req: GoalsRequest, db: Session = Depends(get_db)):
    """更新每日学习目标。"""
    goals = {"daily_new": req.daily_new, "daily_review": req.daily_review}
    set_goals(db, goals)
    return goals
