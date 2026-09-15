"""种子数据导入：词书（kajweb JSONL zip）、ECDICT 词典 CSV、分级文章 JSON。

用法（在 backend 目录下）：
    python -m app.seed           # 增量：对应表非空则跳过
    python -m app.seed --force   # 清空对应表后重导
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
from .db import SessionLocal

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

# (code, 名称, 级别, [data/books/ 下的 zip 词书分卷...])
# 中考/高考第 1 卷在源仓库已下架，用现存的正序版+新东方版合并去重。
BOOKS = [
    ("chuzhong", "中考核心词汇", "beginner", ["ChuZhong_2", "ChuZhong_3"]),
    ("gaokao", "高考核心词汇", "beginner", ["GaoZhong_2", "GaoZhong_3"]),
    ("cet4", "大学英语四级词汇", "cet4", ["CET4_1", "CET4_2", "CET4_3"]),
    ("cet6", "大学英语六级词汇", "cet6", ["CET6_1", "CET6_2", "CET6_3"]),
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


def import_books(force: bool) -> None:
    """导入四本词书：多卷 JSONL 合并去重（按小写词形），rank 即全卷顺序。"""
    with SessionLocal() as db:
        if not force and db.scalar(select(func.count()).select_from(models.BookWord)):
            print("词书已导入，跳过（--force 可重导）")
            return
        db.execute(delete(models.BookWord))
        db.execute(delete(models.WordBook))
        for code, name, level, parts in BOOKS:
            seen: set[str] = set()
            rows: list[models.BookWord] = []
            for part in parts:
                zf = zipfile.ZipFile(DATA_DIR / "books" / f"{part}.zip")
                for line in zf.read(f"{part}.json").decode("utf-8").strip().splitlines():
                    rec = json.loads(line)
                    word = rec["headWord"].strip().lower()
                    if not word or word in seen:
                        continue
                    c = rec["content"]["word"]["content"]
                    seen.add(word)
                    rows.append(models.BookWord(
                        book_id=0,  # 占位：词书落库拿到 id 后回填
                        rank=len(seen),
                        word=word,
                        phonetic_us=(c.get("usphone") or "").strip() or None,
                        phonetic_uk=(c.get("ukphone") or "").strip() or None,
                        meaning=_book_meaning(c.get("trans") or []),
                        detail_json=_book_detail(c),
                    ))
            book = models.WordBook(code=code, name=name, level=level, total=len(rows))
            db.add(book)
            db.flush()
            for r in rows:
                r.book_id = book.id
                db.add(r)
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
    """导入分级文章与理解题；词数在导入时统计，附带清空相关做题记录。"""
    with SessionLocal() as db:
        if not force and db.scalar(select(func.count()).select_from(models.Article)):
            print("文章已导入，跳过（--force 可重导）")
            return
        db.execute(delete(models.Mistake))
        db.execute(delete(models.ReadingAttempt))
        db.execute(delete(models.ArticleQuestion))
        db.execute(delete(models.Article))
        n = q = 0
        for path in sorted((DATA_DIR / "articles").glob("*.json")):
            payload = json.loads(path.read_text(encoding="utf-8"))
            level = payload["level"]
            for a in payload["articles"]:
                word_count = len(re.findall(r"[A-Za-z']+", a["content"]))
                art = models.Article(title=a["title"], level=level, content=a["content"], word_count=word_count)
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
        print(f"文章导入：{n} 篇，{q} 道理解题")


def import_sentences(force: bool) -> None:
    """句子默写种子：按文章标题匹配，并校验原句确实出现在文章里。"""
    with SessionLocal() as db:
        if not force and db.scalar(select(func.count()).select_from(models.ArticleSentence)):
            print("默写句子已导入，跳过（--force 可重导）")
            return
        path = DATA_DIR / "articles" / "sentences.json"
        payload = json.loads(path.read_text(encoding="utf-8"))
        articles = {a.title: a for a in db.scalars(select(models.Article)).all()}
        db.execute(delete(models.ArticleSentence))
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
            db.add(models.ArticleSentence(article_id=art.id, en=s["en"], zh=s["zh"]))
            n += 1
        db.commit()
        print(f"默写句子导入：{n} 句（校验失败 {bad} 句）")


def main() -> None:
    """命令行入口：按词书 → 词典 → 文章 → 默写句子的顺序执行导入。"""
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="清空对应表后重新导入")
    args = ap.parse_args()
    import_books(args.force)
    import_dict(args.force)
    import_articles(args.force)
    import_sentences(args.force)


if __name__ == "__main__":
    main()
