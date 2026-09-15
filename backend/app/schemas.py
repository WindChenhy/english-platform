"""请求体校验模型（Pydantic schemas）。"""
from typing import Literal, Optional

from pydantic import BaseModel, Field


class ReviewRequest(BaseModel):
    """提交一次学习/复习记录。

    Attributes:
        kind: new 表示词书新词的首次作答，review 表示到期复习卡的翻面自评。
        word: 本次作答的英文单词。
        rating: 自评等级，1=忘了 / 2=模糊 / 3=记得。
        book_id: 新词所属词书 id，kind 为 new 时用于定位词条富数据。
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
        source: 仅 kind=word 生效，book 表示从词书出题，wordlist 表示从生词本出题。
        book_id: word/phrase 生效；phrase 为 None 表示全部词书。
        level: 仅 kind=sentence 生效，按文章难度过滤；None 表示全部级别。
        count: 出题数量。
    """

    kind: Literal["word", "phrase", "sentence"]
    source: Literal["book", "wordlist"] = "book"  # word 生效
    book_id: Optional[int] = None  # word/phrase 生效；None 表示全部词书（phrase）
    level: Optional[str] = None  # sentence 生效
    count: int = Field(default=10, ge=1, le=50)
