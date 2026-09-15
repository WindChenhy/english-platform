"""ORM 模型定义：平台全部表。

数据分为六块：
- 词书与词典：WordBook / BookWord / DictWord（种子数据，只读）
- 学习记录：Card（复习卡，生词本与词书共表）/ ReviewLog（复习流水）
- 阅读内容：Article / ArticleQuestion / ArticleSentence（种子数据）/ UserArticle（用户自贴）
- 做题记录：ReadingAttempt / Mistake / DictationLog / BattleLog
- 口语：SpeakingScenario / SpeakingLine / SpeakingRecord（场景对话、跟读录音）
- 偏好：AppSetting（每日目标等键值配置）
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class WordBook(Base):
    """词书（中考/高考/四级/六级/考研），由种子数据导入。"""

    __tablename__ = "word_book"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)  # 词书英文标识
    name: Mapped[str] = mapped_column(String(64))  # 展示名称
    level: Mapped[str] = mapped_column(String(16))  # beginner / cet4 / cet6 / kaoyan
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

    FSRS 参数说明见 app/srs.py；interval >= 21 视为"已掌握"。
    ease 保留作历史兼容与展示，调度已由 stability/difficulty/state 驱动。
    """

    __tablename__ = "card"

    id: Mapped[int] = mapped_column(primary_key=True)
    word: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # 全局唯一
    meaning: Mapped[str] = mapped_column(Text)  # 创建时的释义快照
    phonetic: Mapped[Optional[str]] = mapped_column(String(128))  # 音标快照
    book_id: Mapped[Optional[int]] = mapped_column(ForeignKey("word_book.id"), index=True)  # 生词本卡片为空
    source: Mapped[str] = mapped_column(String(16), default="book")  # book=词书 / wordlist=生词本
    ease: Mapped[float] = mapped_column(Float, default=2.5)  # 兼容字段
    interval: Mapped[int] = mapped_column(default=0)  # 当前复习间隔（天）
    reps: Mapped[int] = mapped_column(default=0)  # 成功复习次数
    lapses: Mapped[int] = mapped_column(default=0)  # 遗忘次数
    due: Mapped[date] = mapped_column(Date, index=True)  # 下次到期日
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())  # 建卡时间
    last_review_at: Mapped[Optional[datetime]]  # 最近一次复习时间
    # FSRS
    stability: Mapped[Optional[float]] = mapped_column(Float)  # 记忆稳定性（天）
    difficulty: Mapped[Optional[float]] = mapped_column(Float)  # 难度 1~10
    state: Mapped[str] = mapped_column(String(16), default="new")  # new/learning/review/relearning
    last_review_date: Mapped[Optional[date]] = mapped_column(Date)  # FSRS elapsed 基准
    # 卡片管理
    suspended_until: Mapped[Optional[date]] = mapped_column(Date, index=True)  # 挂起到该日（含）
    buried_until: Mapped[Optional[date]] = mapped_column(Date, index=True)  # 埋藏到该日（含）
    lapses_window: Mapped[int] = mapped_column(default=0)  # 近期默写/对战错误次数（弱项训练）


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
    """分级阅读文章；category=exam 时为考试题型训练材料。"""

    __tablename__ = "article"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    level: Mapped[str] = mapped_column(String(16), index=True)  # beginner / cet4 / cet6 / kaoyan
    content: Mapped[str] = mapped_column(Text)  # 正文
    word_count: Mapped[int]  # 词数（导入时统计）
    category: Mapped[str] = mapped_column(String(16), default="graded", index=True)  # graded / exam
    exam_label: Mapped[Optional[str]] = mapped_column(String(64))  # 如「四级阅读 · 真题题型」


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


class UserArticle(Base):
    """用户自贴的英文阅读材料，无理解题，支持点词查词与收藏。"""

    __tablename__ = "user_article"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    content: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class DictationLog(Base):
    """默写结果流水：用于正确率统计与弱项词提取。"""

    __tablename__ = "dictation_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(16))  # word/phrase/sentence
    answer: Mapped[str] = mapped_column(String(200))  # 标准答案
    correct: Mapped[bool] = mapped_column(index=True)
    word: Mapped[Optional[str]] = mapped_column(String(64), index=True)  # 关联单词（词/短语源词）
    study_date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BattleLog(Base):
    """对战战绩：一局一场，用于自适应难度与历史展示。"""

    __tablename__ = "battle_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    difficulty: Mapped[str] = mapped_column(String(16))  # easy/normal/hard
    result: Mapped[str] = mapped_column(String(8), index=True)  # win/draw/lose
    user_correct: Mapped[int] = mapped_column(default=0)
    total_rounds: Mapped[int] = mapped_column(default=0)
    avg_seconds: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    study_date: Mapped[date] = mapped_column(Date, index=True)


class AppSetting(Base):
    """应用键值配置（每日目标等）。"""

    __tablename__ = "app_setting"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(Text)  # JSON 字符串


class SpeakingScenario(Base):
    """日常口语场景（机场/餐厅/酒店等）。"""

    __tablename__ = "speaking_scenario"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    title: Mapped[str] = mapped_column(String(120))
    scene: Mapped[str] = mapped_column(String(32), index=True)  # airport / restaurant / hotel / ...
    level: Mapped[str] = mapped_column(String(16), default="beginner")  # beginner / cet4 / cet6
    description: Mapped[str] = mapped_column(Text, default="")


class SpeakingLine(Base):
    """场景对话中的单句台词。"""

    __tablename__ = "speaking_line"

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[int] = mapped_column(ForeignKey("speaking_scenario.id"), index=True)
    ord: Mapped[int] = mapped_column(default=0)  # 对话顺序
    role: Mapped[str] = mapped_column(String(16), default="you")  # you / partner / narrator
    en: Mapped[str] = mapped_column(Text)
    zh: Mapped[str] = mapped_column(Text)
    tip: Mapped[Optional[str]] = mapped_column(Text)  # 发音/用法提示


class SpeakingRecord(Base):
    """跟读/口语练习录音与识别评分。"""

    __tablename__ = "speaking_record"

    id: Mapped[int] = mapped_column(primary_key=True)
    scenario_id: Mapped[Optional[int]] = mapped_column(ForeignKey("speaking_scenario.id"), index=True)
    line_id: Mapped[Optional[int]] = mapped_column(ForeignKey("speaking_line.id"), index=True)
    target_text: Mapped[str] = mapped_column(Text)  # 目标句子
    transcript: Mapped[str] = mapped_column(Text, default="")  # 浏览器识别结果
    score: Mapped[float] = mapped_column(default=0.0)  # 0-100
    audio_path: Mapped[Optional[str]] = mapped_column(String(255))  # 相对 data/recordings 的文件名
    duration_ms: Mapped[int] = mapped_column(default=0)
    study_date: Mapped[date] = mapped_column(Date, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
