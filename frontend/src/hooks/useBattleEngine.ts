/**
 * 人机拼写对战引擎：回合、血量、倒计时、结算与战绩落库。
 * UI 只读 hook 暴露的状态，不直接改 HP/计时器。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { useTranslation } from 'react-i18next';
import { api, type DictationItem } from '../api';
import { normalizeText } from '../grade';
import { speak } from '../speech';

export type BattleDifficulty = 'easy' | 'normal' | 'hard';
export type BattlePhase = 'setup' | 'flash' | 'typing' | 'roundResult' | 'over';

export const MAX_HP = 5;
export const ROUND_SECONDS = 30;
export const FLASH_SECONDS = 3;

/** 三档难度：correctP 为电脑答对概率，compTime 为电脑模拟作答用时区间（秒）。 */
export const DIFFS: Record<BattleDifficulty, { correctP: number; compTime: [number, number] }> = {
  easy: { correctP: 0.45, compTime: [7, 14] },
  normal: { correctP: 0.65, compTime: [5, 12] },
  hard: { correctP: 0.85, compTime: [3, 8] },
};

/** 生成一个"像人拼错"的错拼版本：掉字母 / 邻位对调 / 元音写错三选一。 */
function misspell(word: string): string {
  if (word.length < 4) return word + word[word.length - 1];
  const i = 1 + Math.floor(Math.random() * (word.length - 2));
  const r = Math.random();
  if (r < 0.34) return word.slice(0, i) + word.slice(i + 1);
  if (r < 0.67) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
  const vowels = 'aeiou';
  return word.slice(0, i) + vowels[Math.floor(Math.random() * 5)] + word.slice(i + 1);
}

function randBetween([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}

export interface BattleRound {
  promptType: 'zh' | 'flash';
  prompt: string;
  answer: string;
  compOk: boolean;
  compTime: number;
  compDisplay: string;
}

export interface BattleOutcome {
  userOk: boolean;
  compOk: boolean;
  userDmg: number;
  compDmg: number;
  userElapsed: number;
  compElapsed: number;
  msg: string;
}

export function useBattleEngine(difficulty: BattleDifficulty) {
  const { message } = App.useApp();
  const { t } = useTranslation();

  const [phase, setPhase] = useState<BattlePhase>('setup');
  const [pool, setPool] = useState<DictationItem[]>([]);
  const [round, setRound] = useState<BattleRound | null>(null);
  const roundRef = useRef<BattleRound | null>(null);
  const [roundNo, setRoundNo] = useState(0);

  const [userHp, setUserHp] = useState(MAX_HP);
  const [compHp, setCompHp] = useState(MAX_HP);
  const userHpRef = useRef(MAX_HP);
  const compHpRef = useRef(MAX_HP);

  const [typed, setTyped] = useState('');
  const typedRef = useRef('');
  const [remain, setRemain] = useState(ROUND_SECONDS);
  const [lastHit, setLastHit] = useState<'user' | 'comp' | 'both' | null>(null);
  const [outcome, setOutcome] = useState<BattleOutcome | null>(null);
  const [stats, setStats] = useState({ rounds: 0, userOk: 0, timeSum: 0 });
  const statsRef = useRef({ rounds: 0, userOk: 0, timeSum: 0 });
  const [nextIn, setNextIn] = useState(5);
  const [starting, setStarting] = useState(false);
  const [saved, setSaved] = useState(false);
  const wrongWordsRef = useRef<string[]>([]);
  const difficultyRef = useRef(difficulty);
  difficultyRef.current = difficulty;

  const deadlineRef = useRef(0);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const resolvedRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const resolveRound = useCallback(
    (timeout: boolean) => {
      if (resolvedRef.current) return;
      resolvedRef.current = true;
      clearTimer();
      const r = roundRef.current;
      if (!r) return;
      const userOk = !timeout && normalizeText(typedRef.current) === normalizeText(r.answer);
      const compOk = !timeout && r.compOk;
      const elapsed = Math.min(ROUND_SECONDS, (Date.now() - startRef.current) / 1000);

      let userDmg = 0;
      let compDmg = 0;
      let msg: string;
      if (timeout) {
        userDmg = 1;
        compDmg = 1;
        msg = t('battle.timeout');
      } else if (userOk && compOk) {
        msg = t('battle.bothOk');
      } else if (!userOk && !compOk) {
        userDmg = 1;
        compDmg = 1;
        msg = t('battle.bothWrong');
      } else if (!userOk) {
        userDmg = 1;
        msg = t('battle.userWrong');
      } else {
        compDmg = 1;
        msg = t('battle.compWrong');
      }

      const newU = userHpRef.current - userDmg;
      const newC = compHpRef.current - compDmg;
      userHpRef.current = newU;
      compHpRef.current = newC;
      setUserHp(newU);
      setCompHp(newC);
      setLastHit(userDmg && compDmg ? 'both' : userDmg ? 'user' : compDmg ? 'comp' : null);
      const nextStats = {
        rounds: statsRef.current.rounds + 1,
        userOk: statsRef.current.userOk + (userOk ? 1 : 0),
        timeSum: statsRef.current.timeSum + (timeout ? ROUND_SECONDS : elapsed),
      };
      statsRef.current = nextStats;
      setStats(nextStats);
      if (!userOk && r.answer) {
        wrongWordsRef.current = [...wrongWordsRef.current, r.answer];
      }
      setOutcome({ userOk, compOk, userDmg, compDmg, userElapsed: elapsed, compElapsed: r.compTime, msg });
      setPhase('roundResult');
    },
    [clearTimer, t],
  );

  const startTimer = useCallback(() => {
    clearTimer();
    deadlineRef.current = Date.now() + ROUND_SECONDS * 1000;
    startRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const r = Math.max(0, (deadlineRef.current - Date.now()) / 1000);
      setRemain(r);
      if (r <= 0) resolveRound(true);
    }, 100);
  }, [clearTimer, resolveRound]);

  const beginRound = useCallback(
    (items: DictationItem[], idx: number, diff: BattleDifficulty) => {
      const item = items[idx % items.length];
      const d = DIFFS[diff];
      const compOk = Math.random() < d.correctP;
      const promptType: 'zh' | 'flash' = Math.random() < 0.5 ? 'zh' : 'flash';
      const r: BattleRound = {
        promptType,
        prompt: item.prompt,
        answer: item.answer,
        compOk,
        compTime: randBetween(d.compTime),
        compDisplay: compOk ? item.answer : misspell(item.answer),
      };
      roundRef.current = r;
      resolvedRef.current = false;
      setRound(r);
      setRoundNo(idx + 1);
      setTyped('');
      typedRef.current = '';
      setOutcome(null);
      setLastHit(null);
      setRemain(ROUND_SECONDS);
      if (promptType === 'flash') {
        setPhase('flash');
        speak(item.answer);
      } else {
        setPhase('typing');
        startTimer();
      }
    },
    [startTimer],
  );

  useEffect(() => {
    if (phase !== 'flash') return;
    const timer = window.setTimeout(() => {
      setPhase('typing');
      startTimer();
    }, FLASH_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [phase, startTimer]);

  const persistResult = useCallback(
    async (result: 'win' | 'draw' | 'lose') => {
      if (saved) return;
      setSaved(true);
      try {
        await api.battleResult({
          difficulty: difficultyRef.current,
          result,
          user_correct: statsRef.current.userOk,
          total_rounds: Math.max(statsRef.current.rounds, 1),
          avg_seconds:
            statsRef.current.rounds > 0 ? statsRef.current.timeSum / statsRef.current.rounds : 0,
          wrong_words: wrongWordsRef.current,
        });
      } catch {
        /* 静默 */
      }
    },
    [saved],
  );

  const startGame = useCallback(
    async (bookId: number | undefined) => {
      if (!bookId) {
        message.info(t('battle.needBook'));
        return;
      }
      setStarting(true);
      setSaved(false);
      wrongWordsRef.current = [];
      const empty = { rounds: 0, userOk: 0, timeSum: 0 };
      statsRef.current = empty;
      try {
        const r = await api.dictationQuiz({ kind: 'word', source: 'book', book_id: bookId, count: 50 });
        if (r.items.length < 3) {
          message.error(t('battle.bookTooSmall'));
          return;
        }
        setPool(r.items);
        userHpRef.current = MAX_HP;
        compHpRef.current = MAX_HP;
        setUserHp(MAX_HP);
        setCompHp(MAX_HP);
        setStats(empty);
        beginRound(r.items, 0, difficultyRef.current);
      } catch (e) {
        message.error((e as Error).message);
      } finally {
        setStarting(false);
      }
    },
    [beginRound, message, t],
  );

  const handleNext = useCallback(() => {
    if (userHpRef.current <= 0 || compHpRef.current <= 0) {
      const result =
        userHpRef.current > 0 && compHpRef.current <= 0
          ? 'win'
          : userHpRef.current <= 0 && compHpRef.current <= 0
            ? 'draw'
            : 'lose';
      void persistResult(result);
      setPhase('over');
      return;
    }
    beginRound(pool, roundNo, difficultyRef.current);
  }, [beginRound, persistResult, pool, roundNo]);

  const submitTyped = useCallback(() => {
    setTyped(typedRef.current);
    resolveRound(false);
  }, [resolveRound]);

  const setTypedValue = useCallback((v: string) => {
    setTyped(v);
    typedRef.current = v;
  }, []);

  const surrender = useCallback(() => {
    clearTimer();
    setPhase('setup');
  }, [clearTimer]);

  return {
    phase,
    round,
    roundNo,
    userHp,
    compHp,
    typed,
    remain,
    lastHit,
    outcome,
    stats,
    nextIn,
    setNextIn,
    starting,
    startGame,
    handleNext,
    submitTyped,
    setTypedValue,
    surrender,
    resolveRound,
  };
}
