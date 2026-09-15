"""FSRS-4.5 简化实现：用稳定性/难度调度复习间隔。

rating 映射：1=Again / 2=Hard / 3=Good（内部转 FSRS grade 1/2/4）。
ease 字段仅作兼容展示；真正的调度由 stability / difficulty / state 驱动。
interval >= 21 仍视为"已掌握"。
"""
from __future__ import annotations

import math
from datetime import date, timedelta

# FSRS-4.5 默认权重（开源默认参数）
DEFAULT_W = [
    0.4872, 1.4003, 3.7145, 13.8206,
    5.1618, 1.2298,
    0.8975, 0.031, 1.6474, 0.1367,
    1.0461, 2.1072, 0.0793, 0.3246,
    1.587, 0.2272, 2.8755,
]

DESIRED_RETENTION = 0.9
STABILITY_MIN = 0.1
DIFFICULTY_MIN = 1.0
DIFFICULTY_MAX = 10.0

# 用户 rating → FSRS grade
GRADE = {1: 1, 2: 2, 3: 4}


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def initial_stability(grade: int) -> float:
    w = DEFAULT_W
    return max(w[grade - 1], STABILITY_MIN)


def initial_difficulty(grade: int) -> float:
    w = DEFAULT_W
    return _clamp(w[4] - math.exp(w[5] * (grade - 1)) + 1.0, DIFFICULTY_MIN, DIFFICULTY_MAX)


def retrievability(elapsed_days: float, stability: float) -> float:
    """幂函数可提取性：R = (1 + t / (9S))^-1。"""
    s = max(stability, STABILITY_MIN)
    return (1.0 + max(elapsed_days, 0.0) / (9.0 * s)) ** -1.0


def next_interval(stability: float, request_retention: float = DESIRED_RETENTION) -> int:
    """由稳定性反推下次间隔（天）。"""
    s = max(stability, STABILITY_MIN)
    # R = (1 + I/(9S))^-1  →  I = 9S * (1/R - 1)
    return max(1, round(s * 9.0 * (1.0 / request_retention - 1.0)))


def mean_reversion(current: float, init: float, w0: float) -> float:
    return w0 * init + (1 - w0) * current


def _ease_from_difficulty(d: float) -> float:
    """把 FSRS 难度映射回 ease，便于旧 UI 展示（难→低 ease）。"""
    # D=1 → 2.8, D=10 → 1.3
    t = (d - DIFFICULTY_MIN) / (DIFFICULTY_MAX - DIFFICULTY_MIN)
    return round(2.8 - t * 1.5, 2)


def _difficulty_from_ease(ease: float) -> float:
    """旧卡迁移：SM-2 ease → FSRS difficulty。"""
    t = (2.8 - ease) / 1.5
    return _clamp(DIFFICULTY_MIN + t * (DIFFICULTY_MAX - DIFFICULTY_MIN), DIFFICULTY_MIN, DIFFICULTY_MAX)


def apply_review(card, rating: int, today: date) -> None:
    """根据本次自评更新 FSRS 参数并设置 due。

    - 新卡或无 stability：从初始 S/D 出发；
    - 老卡：用 elapsed 更新 difficulty 与 stability；
    - Again：lapses+1，进入 relearning，间隔 1 天。

    Args:
        card: 复习卡片 ORM 对象（或字段对齐的替身），会被就地修改。
        rating: 1=忘了 / 2=模糊 / 3=记得。
        today: 结算基准日期。
    """
    grade = GRADE[int(rating)]
    w = DEFAULT_W

    # 兼容：旧卡无 FSRS 字段时从 ease/interval 迁移
    if getattr(card, "stability", None) is None:
        if card.interval and card.interval > 0 and card.reps > 0:
            card.stability = float(max(card.interval, STABILITY_MIN))
            card.difficulty = _difficulty_from_ease(getattr(card, "ease", 2.5) or 2.5)
            card.state = "review"
        else:
            card.stability = None
            card.difficulty = None
            card.state = "new"

    first_review = card.state in (None, "new") or card.stability is None

    if first_review:
        s = initial_stability(grade)
        d = initial_difficulty(grade)
        card.stability = s
        card.difficulty = d
        if rating == 1:
            card.state = "learning"
            card.interval = 1
        elif rating == 2:
            card.state = "learning"
            card.interval = max(1, round(next_interval(s) * 0.5))
        else:
            card.state = "review"
            card.interval = next_interval(s)
        card.reps = 1 if rating == 3 else 0
        if rating == 1:
            card.lapses += 1
    else:
        prev_date = getattr(card, "last_review_date", None)
        if prev_date is not None:
            elapsed = max(0, (today - prev_date).days)
        else:
            elapsed = max(card.interval, 0)

        # 难度更新（带均值回复）
        delta_d = -w[6] * (grade - 3)
        d0 = card.difficulty if card.difficulty is not None else initial_difficulty(3)
        new_d = mean_reversion(d0 + delta_d, initial_difficulty(3), w[7])
        card.difficulty = _clamp(new_d, DIFFICULTY_MIN, DIFFICULTY_MAX)

        # 稳定性更新
        s = max(card.stability, STABILITY_MIN)
        r = retrievability(elapsed, s)
        hard_pen = w[15] if grade == 1 else 1.0
        easy_bon = w[16] if grade == 4 else 1.0
        s_new = s * (
            1.0
            + math.exp(w[8])
            * (11.0 - card.difficulty)
            * (s ** (-w[9]))
            * (math.exp(w[10] * (1.0 - r)) - 1.0)
            * hard_pen
            * easy_bon
        )
        if grade == 1:
            # Again：稳定性跌到短期
            s_new = min(s_new, w[11])
        elif grade == 2:
            s_new = min(s_new, s * 1.2)
        card.stability = max(s_new, STABILITY_MIN)

        if rating == 1:
            card.lapses += 1
            card.state = "relearning"
            card.interval = 1
            card.reps = 0
        else:
            card.state = "review"
            card.interval = next_interval(card.stability)
            card.reps += 1

    card.ease = _ease_from_difficulty(card.difficulty or initial_difficulty(grade))
    card.last_review_date = today
    card.due = today + timedelta(days=card.interval)
