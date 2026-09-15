"""请求体校验模型（Pydantic schemas）。"""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ReviewRequest(BaseModel):
    """提交一次学习/复习记录。

    Attributes:
        kind: new=新词路径（无卡则建卡，有卡则复用并结算）；review=到期复习卡翻面自评。
        word: 本次作答的英文单词。
        rating: 自评等级，1=忘了 / 2=模糊 / 3=记得。
        book_id: 新词所属词书 id，kind 为 new 且需从词书建卡时使用。
    """

    kind: Literal["new", "review"]
    word: str
    rating: int = Field(ge=1, le=3)  # 1忘了 / 2模糊 / 3记得
    book_id: Optional[int] = None


class AnswerItem(BaseModel):
    """单道阅读理解题的作答。

    Attributes:
        question_id: 题目 id。
        choice: 用户选择的选项下标（0-based），未作答为 None。
    """

    question_id: int
    choice: Optional[int] = None


class ArticleSubmitRequest(BaseModel):
    """整篇文章阅读理解题的提交载体。"""

    answers: list[AnswerItem]


class WordlistRequest(BaseModel):
    """收藏生词请求。"""

    word: str


class PracticeRequest(BaseModel):
    """错题重练的作答请求。"""

    choice: Optional[int] = None


class DictationQuizRequest(BaseModel):
    """默写出题请求。

    Attributes:
        kind: 出题类型，word=单词 / phrase=短语 / sentence=句子。
        source: 仅 kind=word 生效，book/wordlist/weak。
        book_id: word/phrase 生效；phrase 为 None 表示全部词书。
        level: 仅 kind=sentence 生效，按文章难度过滤；None 表示全部级别。
        count: 出题数量。
    """

    kind: Literal["word", "phrase", "sentence"]
    source: Literal["book", "wordlist", "weak"] = "book"
    book_id: Optional[int] = None
    level: Optional[str] = None
    count: int = Field(default=10, ge=1, le=50)


class DictationResultItem(BaseModel):
    """单题默写结果（前端判分后回传）。"""

    kind: Literal["word", "phrase", "sentence"] = "word"
    answer: str
    correct: bool
    word: Optional[str] = None


class DictationResultRequest(BaseModel):
    """整场默写结果提交。"""

    items: list[DictationResultItem]


class BattleResultRequest(BaseModel):
    """一局对战结算。"""

    difficulty: Literal["easy", "normal", "hard"]
    result: Literal["win", "draw", "lose"]
    user_correct: int = Field(ge=0)
    total_rounds: int = Field(ge=1)
    avg_seconds: float = Field(ge=0, default=0.0)
    wrong_words: list[str] = Field(default_factory=list)


class GoalsRequest(BaseModel):
    """每日学习目标。"""

    daily_new: int = Field(default=10, ge=0, le=200)
    daily_review: int = Field(default=60, ge=0, le=500)


class UserArticleRequest(BaseModel):
    """用户自贴英文材料。"""

    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=10, max_length=20000)


class CardActionRequest(BaseModel):
    """挂起/埋藏卡片。

    Attributes:
        days: 暂停天数，默认 1 天（埋藏通常 1 天，挂起可更长）。
    """

    days: int = Field(default=1, ge=1, le=365)
