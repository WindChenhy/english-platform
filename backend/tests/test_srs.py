"""FSRS 算法（app/srs.py）的单元测试。"""
from datetime import date

from app.srs import apply_review, next_interval, retrievability


class FakeCard:
    """用于纯算法测试的最小卡片替身，字段与 ORM 模型 Card 对齐。"""

    def __init__(self):
        self.ease = 2.5
        self.interval = 0
        self.reps = 0
        self.lapses = 0
        self.due = None
        self.stability = None
        self.difficulty = None
        self.state = "new"
        self.last_review_date = None


def test_new_card_good_rating():
    """新卡首次答"记得"：建立 stability，间隔 >1 天，进入 review。"""
    c = FakeCard()
    apply_review(c, 3, date(2026, 9, 13))
    assert c.state == "review"
    assert c.reps == 1
    assert c.stability is not None and c.stability > 1
    assert c.interval == next_interval(c.stability)
    assert c.interval >= 1
    assert c.due.toordinal() - date(2026, 9, 13).toordinal() == c.interval


def test_progression_grows_interval():
    """连续答"记得"：间隔随稳定性增长。"""
    from datetime import timedelta

    c = FakeCard()
    d0 = date(2026, 9, 13)
    apply_review(c, 3, d0)
    first = c.interval
    apply_review(c, 3, d0 + timedelta(days=first))
    assert c.interval >= first
    apply_review(c, 3, d0 + timedelta(days=first + c.interval))
    assert c.reps >= 2


def test_lapse_resets_and_penalizes():
    """答"忘了"：间隔归 1、reps 清零、lapses+1，进入 relearning。"""
    c = FakeCard()
    apply_review(c, 3, date(2026, 9, 13))
    apply_review(c, 3, date(2026, 9, 20))
    apply_review(c, 1, date(2026, 9, 27))
    assert c.interval == 1
    assert c.reps == 0
    assert c.lapses == 1
    assert c.state == "relearning"
    assert c.due == date(2026, 9, 28)


def test_fuzzy_grows_slowly():
    """答"模糊"：已有 stability 的卡间隔至少保底 1 天，不会爆炸。"""
    c = FakeCard()
    c.stability = 10.0
    c.difficulty = 5.0
    c.state = "review"
    c.reps = 3
    c.interval = 10
    c.last_review_date = date(2026, 9, 3)
    apply_review(c, 2, date(2026, 9, 13))
    assert c.interval >= 1
    assert c.state == "review"
    assert c.difficulty is not None


def test_fuzzy_on_new_card():
    """新卡答"模糊"：间隔保底 1 天。"""
    c = FakeCard()
    apply_review(c, 2, date(2026, 9, 13))
    assert c.interval >= 1
    assert c.due.toordinal() - date(2026, 9, 13).toordinal() == c.interval


def test_retrievability_and_interval():
    """可提取性与间隔公式：R 随时间下降，next_interval 为正。"""
    assert abs(retrievability(0, 10) - 1.0) < 1e-6
    assert retrievability(30, 10) < 1.0
    assert next_interval(10.0) >= 1


def test_legacy_ease_migration():
    """旧卡（无 stability 但有 interval/reps）可从 ease 迁移到 FSRS 字段。"""
    c = FakeCard()
    c.interval = 12
    c.reps = 3
    c.ease = 2.0
    c.stability = None
    apply_review(c, 3, date(2026, 9, 13))
    assert c.stability is not None
    assert c.difficulty is not None
    assert c.state == "review"
