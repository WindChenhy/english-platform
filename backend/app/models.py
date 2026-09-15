"""ORM 模型定义：平台的全部 9 张表。

数据分为四块：
- 词书与词典：WordBook / BookWord / DictWord（种子数据，只读）
- 学习记录：Card（复习卡，生词本与词书共表）/ ReviewLog（复习流水）
- 阅读内容：Article / ArticleQuestion / ArticleSentence（种子数据）
- 做题记录：ReadingAttempt / Mistake
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class WordBook(Base):
    """词书（中考/高考/四级/六级），由种子数据导入。"""

    __tablename__ = "word_book"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)  # 词书英文标识
    name: Mapped[str] = mapped_column(String(64))  # 展示名称
    level: Mapped[str] = mapped_column(String(16))  # beginner / cet4 / cet6
    total: Mapped[int] = mapped_column(default=0)  # 词数


class BookWord(Base):
    """词书内的单个词条，含音标、释义快照与例句/短语/近义词等富数据。"""

    __tablename__ = "book_word"

    id: Mapped[int] = mapped_column(primary_key=True)
    book_id: Mapped[int] = mapped_column(ForeignKey("word_book.id"), index=True)
    rank: Mapped[int]  # 在词书中的顺序
    word: Mapped[str] = mapped_column(String(64))  # 小写规范化的单词
    phonetic_us: Mapped[Optional[str]] = mapped_column(String(64))  # 美式音标
    phonetic_uk: Mapped[Optional[str]] = mapped_column(String(64))  # 英式音标
    meaning: Mapped[str] = mapped_column(Text)  # 合并词性的中文释义
    detail_json: Mapped[Optional[str]] = mapped_column(Text)  # 例句/短语/近义词/同根词 JSON
    __table_args__ = (UniqueConstraint("book_id", "word", name="uq_book_word"),)


class DictWord(Base):
    """ECDICT 词典条目（仅保留有词频排名或考试标签的词），供点词查词使用。"""

    __tablename__ = "dict_word"

    word: Mapped[str] = mapped_column(String(64), primary_key=True)  # 小写规范化的单词
    phonetic: Mapped[Optional[str]] = mapped_column(String(128))  # 音标
    translation: Mapped[Optional[str]] = mapped_column(Text)  # 中文释义
    definition: Mapped[Optional[str]] = mapped_column(Text)  # 英英释义
    tag: Mapped[Optional[str]] = mapped_column(String(128))  # zk/gk/cet4/cet6 等考试标签
    bnc: Mapped[Optional[int]]  # BNC 语料词频排名
    frq: Mapped[Optional[int]]  # 当代语料库词频排名


class Card(Base):
    """复习卡片，词书新词与生词本生词共用本表（source 区分来源）。

    SM-2 参数说明见 app/srs.py；interval >= 21 视为"已掌握"。
    """

    __tablename__ = "card"

    id: Mapped[int] = mapped_column(primary_key=True)
    word: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # 全局唯一
    meaning: Mapped[str] = mapped_column(Text)  # 创建时的释义快照
    phonetic: Mapped[Optional[str]] = mapped_column(String(128))  # 音标快照
    book_id: Mapped[Optional[int]] = mapped_column(ForeignKey("word_book.id"), index=True)  # 生词本卡片为空
    source: Mapped[str] = mapped_column(String(16), default="book")  # book=词书 / wordlist=生词本
    ease: Mapped[float] = mapped_column(Float, default=2.5)  # SM-2 难度系数
    interval: Mapped[int] = mapped_column(default=0)  # 当前复习间隔（天）
    reps: Mapped[int] = mapped_column(default=0)  # 连续答对次数
    lapses: Mapped[int] = mapped_column(default=0)  # 遗忘次数
    due: Mapped[date] = mapped_column(Date, index=True)  # 下次到期日
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())  # 建卡时间
    last_review_at: Mapped[Optional[datetime]]  # 最近一次复习时间


class ReviewLog(Base):
    """复习流水，一行代表一次作答，用于统计今日新学/复习与连续打卡。"""

    __tablename__ = "review_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("card.id"), index=True)
    rating: Mapped[int]  # 1忘了 / 2模糊 / 3记得
    kind: Mapped[str] = mapped_column(String(8))  # new=新词首答 / review=到期复习
    prev_interval: Mapped[int]  # 结算前的间隔
    new_interval: Mapped[int]  # 结算后的间隔
    study_date: Mapped[date] = mapped_column(Date, index=True)  # 学习日期（打卡与日统计口径）
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())  # 精确时间


class Article(Base):
    """分级阅读文章，段落以空行分隔。"""

    __tablename__ = "article"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    level: Mapped[str] = mapped_column(String(16), index=True)  # beginner / cet4 / cet6
    content: Mapped[str] = mapped_column(Text)  # 正文
    word_count: Mapped[int]  # 词数（导入时统计）


class ArticleQuestion(Base):
    """文章配套的阅读理解选择题。"""

    __tablename__ = "article_question"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("article.id"), index=True)
    question: Mapped[str] = mapped_column(Text)  # 题干
    options_json: Mapped[str] = mapped_column(Text)  # 选项 JSON list[str]
    answer: Mapped[int]  # 正确选项下标（0-based）
    explanation: Mapped[Optional[str]] = mapped_column(Text)  # 中文解析


class ArticleSentence(Base):
    """文章原句 + 中文译文，供句子默写出题。"""

    __tablename__ = "article_sentence"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("article.id"), index=True)
    en: Mapped[str] = mapped_column(Text)  # 英文原句（必须出现在文章正文中）
    zh: Mapped[str] = mapped_column(Text)  # 中文译文（默写提示）


class ReadingAttempt(Base):
    """一次阅读理解做题记录。"""

    __tablename__ = "reading_attempt"

    id: Mapped[int] = mapped_column(primary_key=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("article.id"), index=True)
    correct: Mapped[int]  # 答对题数
    total: Mapped[int]  # 总题数
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Mistake(Base):
    """错题记录：理解题答错自动收进，重练答对后置为 resolved。"""

    __tablename__ = "mistake"

    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("article_question.id"), index=True)
    article_id: Mapped[int] = mapped_column(ForeignKey("article.id"))
    user_answer: Mapped[int]  # 当时的错误选项，未作答记 -1
    resolved: Mapped[bool] = mapped_column(default=False, index=True)  # 是否已通过重练
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    resolved_at: Mapped[Optional[datetime]]  # 解决时间
