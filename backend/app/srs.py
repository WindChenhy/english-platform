"""简化 SM-2 间隔重复算法。

只维护 ease（难度系数）、interval（当前间隔天数）、reps（连续答对次数）、
lapses（遗忘次数）四个参数，复习粒度为天。rating 取值：1=忘了 2=模糊 3=记得。
"""
from __future__ import annotations

from datetime import date, timedelta

# ease 的上下限，防止间隔爆炸或惩罚过度
EASE_MIN = 1.3
EASE_MAX = 2.8


def apply_review(card, rating: int, today: date) -> None:
    """根据本次自评更新卡片状态，并计算下次到期日。

    规则：
    - 记得：间隔阶梯增长（1 天 → 6 天 → interval × ease），ease 小幅上调
    - 模糊：间隔 ×1.2，ease 下调
    - 忘了：间隔归 1 天，reps 清零，ease 下调并计一次遗忘

    Args:
        card: 复习卡片 ORM 对象，会被就地修改。
        rating: 本次自评，1=忘了 / 2=模糊 / 3=记得。
        today: 结算基准日期（本地日期），到期日 = today + interval。
    """
    if rating == 3:
        card.reps += 1
        if card.reps == 1:
            card.interval = 1
        elif card.reps == 2:
            card.interval = 6
        else:
            card.interval = max(card.interval + 1, round(card.interval * card.ease))
        card.ease = min(EASE_MAX, card.ease + 0.10)
    elif rating == 2:
        card.ease = max(EASE_MIN, card.ease - 0.14)
        card.interval = max(1, round(card.interval * 1.2))
    else:
        card.ease = max(EASE_MIN, card.ease - 0.20)
        card.interval = 1
        card.reps = 0
        card.lapses += 1
    card.due = today + timedelta(days=card.interval)
