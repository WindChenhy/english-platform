"""口语接口：场景对话、跟读录音上传与回放、发音评分日志。"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from pathlib import Path
from random import sample

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from .. import models
from ..config import DATA_DIR
from ..db import get_db

router = APIRouter(prefix="/api/speaking", tags=["speaking"])

RECORD_DIR = DATA_DIR / "recordings"
ALLOWED_AUDIO = {".webm", ".ogg", ".wav", ".mp3", ".m4a"}


def _ensure_dir() -> None:
    RECORD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/words")
def speaking_words(
    book_id: int | None = None,
    source: str = "book",
    count: int = 20,
    db: Session = Depends(get_db),
):
    """单词发音练习题库：从词书/生词本/弱项抽词，含音标与释义。

    - source=book：需 book_id，按词书 rank 前段优先 + 随机；
    - source=wordlist：生词本卡片；
    - source=weak：lapses 或 lapses_window 偏高的卡。
    """
    count = max(1, min(50, int(count)))
    items: list[dict] = []

    if source == "wordlist" or source == "weak":
        stmt = select(models.Card)
        if source == "wordlist":
            stmt = stmt.where(models.Card.source == "wordlist")
        else:
            stmt = stmt.where(or_(models.Card.lapses >= 1, models.Card.lapses_window >= 1))
        cards = db.scalars(stmt.limit(200)).all()
        pool = cards
        if len(pool) > count:
            pool = sample(pool, count)
        for c in pool:
            items.append({
                "word": c.word,
                "meaning": c.meaning,
                "phonetic": c.phonetic,
                "source": source,
            })
    else:
        if not book_id:
            raise HTTPException(400, "词书练习需要 book_id")
        rows = db.scalars(
            select(models.BookWord)
            .where(models.BookWord.book_id == book_id)
            .order_by(models.BookWord.rank)
            .limit(300)
        ).all()
        if len(rows) > count:
            # 前约一半（count/2）按词频靠前取，其余随机，兼顾基础词与覆盖
            head = rows[: max(3, count // 2)]
            rest = rows[len(head):]
            picked = list(head)
            if rest:
                picked.extend(sample(rest, min(count - len(picked), len(rest))))
            pool = picked[:count]
        else:
            pool = rows
        for bw in pool:
            items.append({
                "word": bw.word,
                "meaning": bw.meaning,
                "phonetic": bw.phonetic_us or bw.phonetic_uk,
                "source": "book",
            })

    return {"items": items, "count": len(items)}


@router.get("/scenarios")
def list_scenarios(scene: str | None = None, db: Session = Depends(get_db)):
    """列出场景对话，可按场景类型过滤。"""
    stmt = select(models.SpeakingScenario).order_by(models.SpeakingScenario.scene, models.SpeakingScenario.id)
    if scene:
        stmt = stmt.where(models.SpeakingScenario.scene == scene)
    rows = db.scalars(stmt).all()
    return [{
        "id": s.id,
        "code": s.code,
        "title": s.title,
        "scene": s.scene,
        "level": s.level,
        "description": s.description,
        "line_count": db.scalar(
            select(func.count()).select_from(models.SpeakingLine)
            .where(models.SpeakingLine.scenario_id == s.id)
        ) or 0,
    } for s in rows]


@router.get("/scenarios/{scenario_id}")
def get_scenario(scenario_id: int, db: Session = Depends(get_db)):
    """场景详情：全部台词。"""
    sc = db.get(models.SpeakingScenario, scenario_id)
    if sc is None:
        raise HTTPException(404, "场景不存在")
    lines = db.scalars(
        select(models.SpeakingLine)
        .where(models.SpeakingLine.scenario_id == scenario_id)
        .order_by(models.SpeakingLine.ord)
    ).all()
    return {
        "id": sc.id,
        "code": sc.code,
        "title": sc.title,
        "scene": sc.scene,
        "level": sc.level,
        "description": sc.description,
        "lines": [{
            "id": ln.id,
            "ord": ln.ord,
            "role": ln.role,
            "en": ln.en,
            "zh": ln.zh,
            "tip": ln.tip,
        } for ln in lines],
    }


@router.get("/records")
def list_records(scenario_id: int | None = None, limit: int = 50, db: Session = Depends(get_db)):
    """录音历史：可按场景过滤，含识别文本与分数。"""
    stmt = select(models.SpeakingRecord).order_by(models.SpeakingRecord.id.desc()).limit(min(limit, 200))
    if scenario_id:
        stmt = stmt.where(models.SpeakingRecord.scenario_id == scenario_id)
    rows = db.scalars(stmt).all()
    return [{
        "id": r.id,
        "scenario_id": r.scenario_id,
        "line_id": r.line_id,
        "target_text": r.target_text,
        "transcript": r.transcript,
        "score": r.score,
        "duration_ms": r.duration_ms,
        "has_audio": bool(r.audio_path),
        "study_date": str(r.study_date),
        "created_at": str(r.created_at),
    } for r in rows]


@router.post("/records")
async def create_record(
    target_text: str = Form(...),
    transcript: str = Form(default=""),
    score: float = Form(default=0.0),
    scenario_id: int | None = Form(default=None),
    line_id: int | None = Form(default=None),
    duration_ms: int = Form(default=0),
    audio: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
):
    """保存一次跟读/口语练习：可选上传音频，记录识别结果与评分。"""
    _ensure_dir()
    audio_name = None
    if audio is not None and audio.filename:
        ext = Path(audio.filename).suffix.lower() or ".webm"
        if ext not in ALLOWED_AUDIO:
            raise HTTPException(400, f"不支持的音频格式：{ext}")
        audio_name = f"{uuid.uuid4().hex}{ext}"
        dest = RECORD_DIR / audio_name
        content = await audio.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(400, "音频过大（上限 20MB）")
        dest.write_bytes(content)

    rec = models.SpeakingRecord(
        scenario_id=scenario_id,
        line_id=line_id,
        target_text=target_text[:2000],
        transcript=(transcript or "")[:2000],
        score=max(0.0, min(100.0, float(score))),
        audio_path=audio_name,
        duration_ms=max(0, int(duration_ms)),
        study_date=date.today(),
    )
    db.add(rec)
    db.commit()
    return {
        "id": rec.id,
        "score": rec.score,
        "has_audio": bool(rec.audio_path),
        "study_date": str(rec.study_date),
    }


@router.get("/records/{record_id}/audio")
def get_audio(record_id: int, db: Session = Depends(get_db)):
    """回放某条录音文件。"""
    rec = db.get(models.SpeakingRecord, record_id)
    if rec is None or not rec.audio_path:
        raise HTTPException(404, "录音不存在")
    path = RECORD_DIR / rec.audio_path
    if not path.is_file():
        raise HTTPException(404, "音频文件已丢失")
    return FileResponse(path, media_type="audio/webm", filename=rec.audio_path)


@router.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    """删除一条录音记录及音频文件。"""
    rec = db.get(models.SpeakingRecord, record_id)
    if rec is None:
        raise HTTPException(404, "记录不存在")
    if rec.audio_path:
        p = RECORD_DIR / rec.audio_path
        if p.is_file():
            p.unlink()
    db.delete(rec)
    db.commit()
    return {"deleted": True}


@router.get("/stats")
def speaking_stats(days: int = 30, db: Session = Depends(get_db)):
    """近 N 天口语练习次数与平均分。"""
    today = date.today()
    since = today - timedelta(days=max(0, days - 1))
    rows = db.execute(
        select(models.SpeakingRecord.study_date, func.count(), func.avg(models.SpeakingRecord.score))
        .where(models.SpeakingRecord.study_date >= since)
        .group_by(models.SpeakingRecord.study_date)
    ).all()
    daily = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        hit = next((r for r in rows if r[0] == d), None)
        daily.append({
            "date": str(d),
            "count": hit[1] if hit else 0,
            "avg_score": round(float(hit[2]), 1) if hit and hit[2] is not None else None,
        })
    total = db.scalar(select(func.count()).select_from(models.SpeakingRecord)) or 0
    avg = db.scalar(select(func.avg(models.SpeakingRecord.score))) or 0
    return {"total": total, "avg_score": round(float(avg), 1), "daily": daily}
