"""种子数据导入：词书（kajweb JSONL zip）、ECDICT 词典 CSV、分级/真题文章 JSON、口语场景。

用法（在 backend 目录下）：
    python -m app.seed           # 增量：已存在的词书/文章/场景跳过，只补缺失项
    python -m app.seed --force   # 清空对应表后重导（会破坏 Card.book_id 等外键，仅初始化用）
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import zipfile
from pathlib import Path

from sqlalchemy import delete, func, select

from . import models
from .config import settings
from .db import SessionLocal

# 种子数据根目录（只读）
DATA_DIR = settings.seed_dir

# (code, 名称, 级别, [data/books/ 下的 zip 词书分卷...])
# 中考/高考第 1 卷在源仓库已下架，用现存的正序版+新东方版合并去重。
BOOKS = [
    ("chuzhong", "中考核心词汇", "beginner", ["ChuZhong_2", "ChuZhong_3"]),
    ("gaokao", "高考核心词汇", "beginner", ["GaoZhong_2", "GaoZhong_3"]),
    ("cet4", "大学英语四级词汇", "cet4", ["CET4_1", "CET4_2", "CET4_3"]),
    ("cet6", "大学英语六级词汇", "cet6", ["CET6_1", "CET6_2", "CET6_3"]),
    ("kaoyan", "考研英语词汇", "kaoyan", ["KaoYan_1", "KaoYan_2", "KaoYan_3"]),
]


def _book_meaning(trans: list[dict]) -> str:
    """把词书 JSON 的释义列表合并为 '词性. 中文' 的展示串。"""
    parts = []
    for t in trans:
        pos = (t.get("pos") or "").strip()
        cn = (t.get("tranCn") or "").strip()
        if cn:
            parts.append(f"{pos}. {cn}" if pos else cn)
    return "；".join(parts) or "（无释义）"


def _book_detail(c: dict) -> str | None:
    """裁剪词条富数据（例句/短语/近义词/同根词）为紧凑 JSON，无内容时返回 None。"""
    detail: dict = {}
    sents = (c.get("sentence") or {}).get("sentences") or []
    if sents:
        detail["sentences"] = [{"en": s.get("sContent"), "zh": s.get("sCn")} for s in sents[:3]]
    phrases = (c.get("phrase") or {}).get("phrases") or []
    if phrases:
        detail["phrases"] = [{"en": p.get("pContent"), "zh": p.get("pCn")} for p in phrases[:3]]
    synos = (c.get("syno") or {}).get("synos") or []
    if synos:
        detail["synonyms"] = [{"word": s.get("hw"), "zh": (s.get("tran") or "").strip()} for s in synos[:3]]
    rels = (c.get("relWord") or {}).get("rels") or []
    related = [
        {"pos": r.get("pos"), "word": w.get("hwd"), "zh": (w.get("tran") or "").strip()}
        for r in rels
        for w in (r.get("words") or [])
    ]
    if related:
        detail["related"] = related[:4]
    return json.dumps(detail, ensure_ascii=False) if detail else None


def _load_book_rows(parts: list[str]) -> list[dict]:
    """从 zip 分卷读出按 rank 排序的去重词条原始记录。"""
    seen: set[str] = set()
    rows: list[dict] = []
    for part in parts:
        zf = zipfile.ZipFile(DATA_DIR / "books" / f"{part}.zip")
        for line in zf.read(f"{part}.json").decode("utf-8").strip().splitlines():
            rec = json.loads(line)
            word = rec["headWord"].strip().lower()
            if not word or word in seen:
                continue
            seen.add(word)
            rows.append(rec)
    return rows


def import_books(force: bool) -> None:
    """导入词书：多卷 JSONL 合并去重。

    - --force：清空全部词书后重导（会破坏 Card.book_id 外键，仅初始化用）；
    - 默认：已存在的词书跳过，只增量补新词书（如后加的考研）。
    """
    with SessionLocal() as db:
        existing = {b.code for b in db.scalars(select(models.WordBook)).all()}
        if force:
            db.execute(delete(models.BookWord))
            db.execute(delete(models.WordBook))
            db.commit()
            existing = set()
        elif not existing and db.scalar(select(func.count()).select_from(models.BookWord)):
            print("词书表非空但缺少词书记录，跳过（--force 可重导）")
            return

        for code, name, level, parts in BOOKS:
            if code in existing:
                print(f"{name}（{code}）已存在，跳过")
                continue
            rows = _load_book_rows(parts)
            book = models.WordBook(code=code, name=name, level=level, total=len(rows))
            db.add(book)
            db.flush()
            for i, rec in enumerate(rows, 1):
                c = rec["content"]["word"]["content"]
                db.add(models.BookWord(
                    book_id=book.id,
                    rank=i,
                    word=rec["headWord"].strip().lower(),
                    phonetic_us=(c.get("usphone") or "").strip() or None,
                    phonetic_uk=(c.get("ukphone") or "").strip() or None,
                    meaning=_book_meaning(c.get("trans") or []),
                    detail_json=_book_detail(c),
                ))
            print(f"{name}（{code}）：{len(rows)} 词")
        db.commit()


def import_dict(force: bool) -> None:
    """ECDICT 只保留有词频排名（bnc/frq）或考试标签的词，覆盖文章与词书全部常用词。"""
    with SessionLocal() as db:
        if not force and db.scalar(select(func.count()).select_from(models.DictWord)):
            print("词典已导入，跳过（--force 可重导）")
            return
        db.execute(delete(models.DictWord))
        batch: list[models.DictWord] = []
        seen: set[str] = set()
        kept = skipped = 0
        with (DATA_DIR / "ecdict.csv").open(encoding="utf-8") as f:
            for row in csv.DictReader(f):
                word = (row.get("word") or "").strip().lower()
                if not word or len(word) > 64 or word in seen:
                    skipped += 1
                    continue
                try:
                    bnc = int(row.get("bnc") or 0)
                except ValueError:
                    bnc = 0
                try:
                    frq = int(row.get("frq") or 0)
                except ValueError:
                    frq = 0
                tag = (row.get("tag") or "").strip()
                if not (bnc or frq or tag):
                    skipped += 1
                    continue
                seen.add(word)
                batch.append(models.DictWord(
                    word=word,
                    phonetic=(row.get("phonetic") or "").strip() or None,
                    translation=(row.get("translation") or "").strip() or None,
                    definition=(row.get("definition") or "").strip() or None,
                    tag=tag or None,
                    bnc=bnc or None,
                    frq=frq or None,
                ))
                kept += 1
                if len(batch) >= 20000:
                    db.bulk_save_objects(batch)
                    db.commit()
                    batch.clear()
        if batch:
            db.bulk_save_objects(batch)
        db.commit()
        print(f"词典导入：{kept} 词（过滤 {skipped} 条无词频无标签条目）")


def import_articles(force: bool) -> None:
    """导入分级文章与考试题型材料；支持按 category+level 增量补新。"""
    with SessionLocal() as db:
        if force:
            db.execute(delete(models.Mistake))
            db.execute(delete(models.ReadingAttempt))
            db.execute(delete(models.ArticleQuestion))
            db.execute(delete(models.ArticleSentence))
            db.execute(delete(models.Article))
            db.commit()

        existing = set(
            db.execute(
                select(models.Article.level, models.Article.category).distinct()
            ).all()
        )

        n = q = 0
        for path in sorted((DATA_DIR / "articles").glob("*.json")):
            if path.name == "sentences.json":
                continue
            payload = json.loads(path.read_text(encoding="utf-8"))
            level = payload["level"]
            category = payload.get("category") or "graded"
            exam_label = payload.get("exam_label")
            if not force and (level, category) in existing:
                print(f"文章 {category}/{level} 已导入，跳过")
                continue
            for a in payload["articles"]:
                dup = db.scalar(select(models.Article).where(models.Article.title == a["title"]))
                if dup:
                    continue
                word_count = len(re.findall(r"[A-Za-z']+", a["content"]))
                art = models.Article(
                    title=a["title"],
                    level=level,
                    content=a["content"],
                    word_count=word_count,
                    category=category,
                    exam_label=exam_label,
                )
                db.add(art)
                db.flush()
                for question in a["questions"]:
                    db.add(models.ArticleQuestion(
                        article_id=art.id,
                        question=question["question"],
                        options_json=json.dumps(question["options"], ensure_ascii=False),
                        answer=question["answer"],
                        explanation=question.get("explanation", ""),
                    ))
                    q += 1
                n += 1
        db.commit()
        print(f"文章导入：新增 {n} 篇，{q} 道理解题")


def import_sentences(force: bool) -> None:
    """句子默写种子：按文章标题匹配；已入库的句子跳过，支持增量补句。"""
    with SessionLocal() as db:
        path = DATA_DIR / "articles" / "sentences.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        articles = {a.title: a for a in db.scalars(select(models.Article)).all()}
        if force:
            db.execute(delete(models.ArticleSentence))
            db.commit()
        existing = {
            (s.en, s.article_id)
            for s in db.scalars(select(models.ArticleSentence)).all()
        }
        n = bad = 0
        for s in payload["sentences"]:
            art = articles.get(s["article_title"])
            if art is None:
                print(f"  警告：找不到文章《{s['article_title']}》，跳过")
                bad += 1
                continue
            if s["en"] not in art.content:
                print(f"  警告：原句不在《{s['article_title']}》正文中，请核对：{s['en'][:50]}...")
                bad += 1
                continue
            if (s["en"], art.id) in existing:
                continue
            db.add(models.ArticleSentence(article_id=art.id, en=s["en"], zh=s["zh"]))
            n += 1
        db.commit()
        print(f"默写句子导入：新增 {n} 句（校验失败 {bad} 句）")


def import_speaking(force: bool) -> None:
    """导入日常口语场景对话（机场/餐厅/酒店等）。"""
    path = DATA_DIR / "speaking" / "scenarios.json"
    if not path.is_file():
        print("未找到口语场景种子文件，跳过")
        return
    payload = json.loads(path.read_text(encoding="utf-8"))
    with SessionLocal() as db:
        if force:
            db.execute(delete(models.SpeakingRecord))
            db.execute(delete(models.SpeakingLine))
            db.execute(delete(models.SpeakingScenario))
            db.commit()
        existing = {s.code for s in db.scalars(select(models.SpeakingScenario)).all()}
        n_lines = 0
        for sc in payload.get("scenarios") or []:
            if sc["code"] in existing:
                continue
            row = models.SpeakingScenario(
                code=sc["code"],
                title=sc["title"],
                scene=sc["scene"],
                level=sc.get("level") or "beginner",
                description=sc.get("description") or "",
            )
            db.add(row)
            db.flush()
            for i, line in enumerate(sc.get("lines") or []):
                db.add(models.SpeakingLine(
                    scenario_id=row.id,
                    ord=i,
                    role=line.get("role") or "you",
                    en=line["en"],
                    zh=line.get("zh") or "",
                    tip=line.get("tip"),
                ))
                n_lines += 1
        db.commit()
        total = db.scalar(select(func.count()).select_from(models.SpeakingScenario)) or 0
        print(f"口语场景：共 {total} 个（本轮新增台词 {n_lines} 句）")


def main() -> None:
    """命令行入口：按词书 → 词典 → 文章 → 默写句子 → 口语场景的顺序执行导入。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="清空对应表后重新导入")
    args = ap.parse_args()
    import_books(args.force)
    import_dict(args.force)
    import_articles(args.force)
    import_sentences(args.force)
    import_speaking(args.force)


if __name__ == "__main__":
    main()
