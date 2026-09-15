"""简化 SM-2 算法（app/srs.py）的单元测试。"""
from datetime import date, timedelta

from app.srs import apply_review


class FakeCard:
    """用于纯算法测试的最小卡片替身，字段与 ORM 模型 Card 对齐。"""

    def __init__(self):
        self.ease = 2.5
        self.interval = 0
        self.reps = 0
        self.lapses = 0
        self.due = None


def test_new_card_good_rating():
    """新卡首次答"记得"：间隔 1 天，ease 上调，明天到期。"""
    c = FakeCard()
    apply_review(c, 3, date(2026, 9, 13))
    assert c.interval == 1
    assert c.reps == 1
    assert c.due == date(2026, 9, 14)
    assert c.ease == 2.6


def test_progression_1_6_then_ease():
    """连续答"记得"：间隔按 1 天 → 6 天 → interval × ease 阶梯增长。"""
    c = FakeCard()
    apply_review(c, 3, date(2026, 9, 13))  # reps=1, interval=1
    apply_review(c, 3, date(2026, 9, 14))  # reps=2, interval=6
    assert c.interval == 6
    ease_before = c.ease
    apply_review(c, 3, date(2026, 9, 20))  # reps=3，间隔 = max(interval+1, interval*ease)
    assert c.interval == max(7, round(6 * ease_before))


def test_lapse_resets_and_penalizes():
    """答"忘了"：间隔归 1、reps 清零、ease 下调并计一次遗忘。"""
    c = FakeCard()
    apply_review(c, 3, date(2026, 9, 13))
    apply_review(c, 3, date(2026, 9, 14))
    before_ease = c.ease
    apply_review(c, 1, date(2026, 9, 20))  # 忘了
    assert c.interval == 1
    assert c.reps == 0
    assert c.lapses == 1
    assert c.ease == before_ease - 0.20
    assert c.due == date(2026, 9, 21)


def test_fuzzy_grows_slowly():
    """答"模糊"：老卡间隔 ×1.2，ease 小幅下调。"""
    c = FakeCard()
    c.interval = 10
    apply_review(c, 2, date(2026, 9, 13))  # 模糊
    assert c.interval == 12  # round(10 * 1.2)
    assert c.ease == 2.36  # 2.5 - 0.14


def test_fuzzy_on_new_card():
    """新卡答"模糊"：间隔保底 1 天。"""
    c = FakeCard()
    apply_review(c, 2, date(2026, 9, 13))
    assert c.interval == 1
    assert c.due == date(2026, 9, 14)


def test_ease_bounds():
    """ease 有下限：连续遗忘也不会跌破 1.3。"""
    c = FakeCard()
    c.ease = 1.35
    for _ in range(5):
        apply_review(c, 1, date(2026, 9, 13))
    assert c.ease >= 1.3
