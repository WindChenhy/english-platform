/**
 * 单词拼写对打页：用户 vs 电脑，各 5 颗❤️。
 * 每轮给出中文释义或闪现 3 秒的英文单词，30 秒内提交拼写；
 * 答错方扣血、超时双扣、双方都对算平局；结算后自动 5 秒进入下一回合。
 */
import { useQuery } from '@tanstack/react-query';
import { App, Button, Card, Col, Input, Result, Row, Segmented, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, Book, DictationItem } from '../api';
import { normalizeText } from '../grade';
import { speak } from '../speech';
import { useStudyStore } from '../store';

type Difficulty = 'easy' | 'normal' | 'hard';
type Phase = 'setup' | 'flash' | 'typing' | 'roundResult' | 'over';

const MAX_HP = 5;
const ROUND_SECONDS = 30;
const FLASH_SECONDS = 3;

/** 三档难度：correctP 为电脑答对概率，compTime 为电脑模拟作答用时区间（秒）。 */
const DIFFS: Record<Difficulty, { correctP: number; compTime: [number, number] }> = {
  easy: { correctP: 0.45, compTime: [7, 14] },
  normal: { correctP: 0.65, compTime: [5, 12] },
  hard: { correctP: 0.85, compTime: [3, 8] },
};

/** 生成一个"像人拼错"的错拼版本：掉字母 / 邻位对调 / 元音写错三选一。 */
function misspell(word: string): string {
  if (word.length < 4) return word + word[word.length - 1];
  const i = 1 + Math.floor(Math.random() * (word.length - 2));
  const r = Math.random();
  if (r < 0.34) return word.slice(0, i) + word.slice(i + 1); // 掉字母
  if (r < 0.67) return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2); // 邻位对调
  const vowels = 'aeiou';
  return word.slice(0, i) + vowels[Math.floor(Math.random() * 5)] + word.slice(i + 1); // 元音写错
}

/** 在闭区间 [a, b] 内取一个随机数（电脑的模拟作答用时）。 */
function randBetween([a, b]: [number, number]): number {
  return a + Math.random() * (b - a);
}

/** 渲染血量：满血 ❤️ / 已扣 🖤，共 MAX_HP 颗。 */
function hearts(hp: number): string {
  return Array.from({ length: MAX_HP }, (_, i) => (i < hp ? '❤️' : '🖤')).join(' ');
}

interface Round {
  promptType: 'zh' | 'flash';
  prompt: string;
  answer: string;
  compOk: boolean;
  compTime: number;
  compDisplay: string;
}

interface Outcome {
  userOk: boolean;
  compOk: boolean;
  userDmg: number;
  compDmg: number;
  userElapsed: number;
  compElapsed: number;
  msg: string;
}

export default function Battle() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: books } = useQuery({ queryKey: ['books'], queryFn: api.books });
  const { battleAvatar, setBattleAvatar } = useStudyStore();

  const [phase, setPhase] = useState<Phase>('setup');
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [bookId, setBookId] = useState<number | undefined>(3);
  const [starting, setStarting] = useState(false);

  const [pool, setPool] = useState<DictationItem[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const roundRef = useRef<Round | null>(null);
  const [roundNo, setRoundNo] = useState(0);

  const [userHp, setUserHp] = useState(MAX_HP);
  const [compHp, setCompHp] = useState(MAX_HP);
  const userHpRef = useRef(MAX_HP);
  const compHpRef = useRef(MAX_HP);

  const [typed, setTyped] = useState('');
  const typedRef = useRef('');
  const [remain, setRemain] = useState(ROUND_SECONDS);
  const [lastHit, setLastHit] = useState<'user' | 'comp' | 'both' | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [stats, setStats] = useState({ rounds: 0, userOk: 0, timeSum: 0 });
  const [nextIn, setNextIn] = useState(5);

  const deadlineRef = useRef(0);
  const startRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const resolvedRef = useRef(false); // 防止超时回调与手动提交在同一时刻双重结算

  function clearTimer() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => clearTimer, []);

  /** 启动 30 秒作答倒计时；到点自动按超时结算。 */
  function startTimer() {
    clearTimer();
    deadlineRef.current = Date.now() + ROUND_SECONDS * 1000;
    startRef.current = Date.now();
    timerRef.current = window.setInterval(() => {
      const r = Math.max(0, (deadlineRef.current - Date.now()) / 1000);
      setRemain(r);
      if (r <= 0) resolveRound(true);
    }, 100);
  }

  /** 开始第 idx 轮：预掷电脑结果，按题型进入中文提示或英文闪现阶段。 */
  function beginRound(items: DictationItem[], idx: number, difficulty: Difficulty) {
    const item = items[idx % items.length];
    const d = DIFFS[difficulty];
    const compOk = Math.random() < d.correctP;
    const promptType: 'zh' | 'flash' = Math.random() < 0.5 ? 'zh' : 'flash';
    const r: Round = {
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
  }

  // 英文闪现 3 秒后进入拼写
  useEffect(() => {
    if (phase !== 'flash') return;
    const t = window.setTimeout(() => {
      setPhase('typing');
      startTimer();
    }, FLASH_SECONDS * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /** 结算当前回合：判定双方对错、扣血并写回合横幅数据（resolvedRef 防重入）。 */
  function resolveRound(timeout: boolean) {
    if (resolvedRef.current) return; // 已结算过则忽略（超时回调与手动提交竞态）
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
    setStats((s) => ({
      rounds: s.rounds + 1,
      userOk: s.userOk + (userOk ? 1 : 0),
      timeSum: s.timeSum + (timeout ? ROUND_SECONDS : elapsed),
    }));
    setOutcome({ userOk, compOk, userDmg, compDmg, userElapsed: elapsed, compElapsed: r.compTime, msg });
    setPhase('roundResult');
  }

  /** 按当前难度和词书开一局新对战：重新抽词、满血、进入第 1 回合。 */
  async function startGame() {
    if (!bookId) {
      message.info(t('battle.needBook'));
      return;
    }
    setStarting(true);
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
      setStats({ rounds: 0, userOk: 0, timeSum: 0 });
      beginRound(r.items, 0, diff);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  /** 结算倒计时结束后的流转：有人倒下则进入结算屏，否则开下一回合。 */
  function handleNext() {
    if (userHpRef.current <= 0 || compHpRef.current <= 0) {
      setPhase('over');
      return;
    }
    beginRound(pool, roundNo, diff);
  }

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  // 回合结算后停留 5 秒再自动进入下一回合（或战局结算），期间可跳过
  useEffect(() => {
    if (phase !== 'roundResult') return;
    setNextIn(5);
    const deadline = Date.now() + 5000;
    const t = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setNextIn(left);
      if (left <= 0) {
        clearInterval(t);
        handleNextRef.current();
      }
    }, 200);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ---------- 设置 ----------
  if (phase === 'setup') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <Card title={t('battle.title')} style={{ background: '#fff' }}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Text type="secondary">{t('battle.rules')}</Typography.Text>
            <Row align="middle">
              <Col span={5}>
                <Typography.Text type="secondary">{t('battle.yourRole')}</Typography.Text>
              </Col>
              <Col span={19}>
                <Space size={8} wrap>
                  {['👤', '🦸', '🐱', '🦁', '🧛', '🐼'].map((a) => (
                    <button
                      key={a}
                      className="avatar-pick"
                      style={
                        a === battleAvatar
                          ? { borderColor: 'var(--ink-primary)', background: 'var(--highlight-soft)' }
                          : undefined
                      }
                      onClick={() => setBattleAvatar(a)}
                    >
                      {a}
                    </button>
                  ))}
                </Space>
              </Col>
            </Row>
            <Row align="middle">
              <Col span={5}>
                <Typography.Text type="secondary">{t('battle.difficulty')}</Typography.Text>
              </Col>
              <Col span={19}>
                <Segmented
                  block
                  value={diff}
                  onChange={(v) => setDiff(v as Difficulty)}
                  options={(Object.keys(DIFFS) as Difficulty[]).map((k) => ({
                    value: k,
                    label: t(`battle.${k}`),
                  }))}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t(`battle.${diff}Desc`)}
                </Typography.Text>
              </Col>
            </Row>
            <Row align="middle">
              <Col span={5}>
                <Typography.Text type="secondary">{t('battle.book')}</Typography.Text>
              </Col>
              <Col span={19}>
                <Select
                  style={{ width: '100%' }}
                  value={bookId}
                  onChange={(v) => setBookId(v)}
                  options={(books ?? []).map((b: Book) => ({
                    value: b.id,
                    label: `${b.name}（${t(`common.level.${b.level}`)}）`,
                  }))}
                />
              </Col>
            </Row>
            <Button type="primary" block size="large" loading={starting} onClick={startGame}>
              {t('battle.start')}
            </Button>
          </Space>
        </Card>
      </div>
    );
  }

  // ---------- 结算 ----------
  if (phase === 'over') {
    const win = userHp > 0 && compHp <= 0;
    const draw = userHp <= 0 && compHp <= 0;
    const avg = stats.rounds > 0 ? (stats.timeSum / stats.rounds).toFixed(1) : '0';
    return (
      <Result
        icon={<span style={{ fontSize: 64 }}>{win ? '🏆' : draw ? '🤝' : '💀'}</span>}
        title={win ? t('battle.overWin') : draw ? t('battle.overDraw') : t('battle.overLose')}
        subTitle={t('battle.overSub', {
          rounds: stats.rounds,
          acc: Math.round((stats.userOk / Math.max(stats.rounds, 1)) * 100),
          avg,
        })}
        extra={[
          <Button key="again" type="primary" onClick={startGame}>
            {t('battle.again')}
          </Button>,
          <Button key="setup" onClick={() => setPhase('setup')}>
            {t('battle.changeSetup')}
          </Button>,
          <Button key="home" onClick={() => navigate('/')}>
            {t('common.back')}
          </Button>,
        ]}
      />
    );
  }

  const r = round;
  const compProgress =
    phase === 'typing' && r
      ? Math.min(r.compDisplay.length, Math.floor(((ROUND_SECONDS - remain) / r.compTime) * r.compDisplay.length))
      : 0;
  const urgent = remain <= 5;

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={14}>
      {/* 对战场景 */}
      <Card className="arena" styles={{ body: { padding: '16px 18px 10px' } }}>
        <Row align="top" justify="space-between">
          <Col span={7} className={`fighter ${lastHit === 'user' ? 'hit-anim' : ''}`}>
            <span className="fighter-avatar">{battleAvatar}</span>
            <div className="fighter-name">{t('battle.you')}</div>
            <div className="hp-hearts">{hearts(userHp)}</div>
          </Col>
          <Col span={10} style={{ textAlign: 'center' }}>
            <div className="timer-wrap">
              <div
                className="timer-ring"
                style={{
                  background: `conic-gradient(${urgent ? 'var(--red-pen)' : 'var(--ink-primary)'} ${
                    (Math.max(0, remain) / ROUND_SECONDS) * 100
                  }%, var(--rule) 0)`,
                }}
              >
                <div className={`timer-inner ${urgent ? 'urgent' : ''}`}>{Math.ceil(remain)}</div>
              </div>
              <div className="timer-label">{t('battle.timerLabel')}</div>
              <div className="vs-badge">VS</div>
            </div>
          </Col>
          <Col span={7} className={`fighter ${lastHit === 'comp' ? 'hit-anim' : ''}`}>
            <span className="fighter-avatar">🤖</span>
            <div className="fighter-name">
              {t('battle.comp')} · {t(`battle.${diff}`)}
            </div>
            <div className="hp-hearts">{hearts(compHp)}</div>
          </Col>
        </Row>
        <div className="arena-floor" />
      </Card>

      {/* 回合提示卡 */}
      {r && (
        <Card className="study-paper" styles={{ body: { paddingBottom: 22 } }}>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <Tag color="var(--ink-primary)" style={{ background: '#fff' }}>
              {t('battle.round', { n: roundNo })}
            </Tag>
            <span className="eyebrow" style={{ marginLeft: 8 }}>
              {r.promptType === 'zh' ? t('battle.promptZh') : t('battle.promptFlash')}
            </span>
            <Button
              type="text"
              size="small"
              style={{ marginLeft: 10, color: 'var(--ink-soft)' }}
              onClick={() => {
                clearTimer();
                setPhase('setup');
              }}
            >
              {t('battle.surrender')}
            </Button>
            <Button
              type="text"
              size="small"
              style={{ marginLeft: 4, color: 'var(--amber-ink)' }}
              loading={starting}
              onClick={startGame}
              title={t('battle.resetTitle')}
            >
              {t('battle.reset')}
            </Button>
          </div>

          {phase === 'flash' && r.promptType === 'flash' && (
            <div style={{ textAlign: 'center', padding: '18px 0 10px' }}>
              <div className="study-word">
                <span className="marker-ink">{r.answer}</span>
              </div>
              <div className="hand" style={{ color: 'var(--amber-ink)', marginTop: 8 }}>
                {t('battle.remember', { n: FLASH_SECONDS })}
              </div>
            </div>
          )}

          {r.promptType === 'zh' && (
            <div
              style={{
                textAlign: 'center',
                fontSize: 26,
                fontWeight: 650,
                color: 'var(--ink)',
                lineHeight: 1.6,
                maxWidth: 640,
                margin: '8px auto 14px',
              }}
            >
              {r.prompt}
            </div>
          )}
          {phase !== 'flash' && r.promptType === 'flash' && (
            <div className="study-phonetic" style={{ marginBottom: 10 }}>
              {t('battle.hidden')}
            </div>
          )}

          {/* 回合结算横幅 */}
          {phase === 'roundResult' && outcome && (
            <div className="round-banner">
              <div
                className="hand"
                style={{
                  fontSize: 18,
                  color: outcome.userDmg ? 'var(--red-pen)' : outcome.compDmg ? 'var(--green-ink)' : 'var(--ink-soft)',
                }}
              >
                {outcome.msg}
              </div>
              <div className="round-detail">
                <span>
                  {t('battle.yourAnswer')}
                  <b style={{ color: outcome.userOk ? 'var(--green-ink)' : 'var(--red-pen)' }}>
                    {typed || t('battle.timedOut')} {outcome.userOk ? '✓' : '✗'}
                  </b>
                  <span className="detail-cn">（{outcome.userElapsed.toFixed(1)}s）</span>
                </span>
                <span>
                  {t('battle.compAnswer')}
                  <b style={{ color: outcome.compOk ? 'var(--green-ink)' : 'var(--red-pen)' }}>
                    {r.compDisplay} {outcome.compOk ? '✓' : '✗'}
                  </b>
                  <span className="detail-cn">（{outcome.compElapsed.toFixed(1)}s）</span>
                </span>
              </div>
              <div className="next-count">
                {t('battle.nextCount', {
                  n: nextIn,
                  target: userHp <= 0 || compHp <= 0 ? t('battle.targetOver') : t('battle.targetNext'),
                })}
              </div>
              <Button size="small" onClick={handleNext}>
                {t('common.skip')}
              </Button>
            </div>
          )}

          {/* 输入区 */}
          {phase !== 'roundResult' && (
            <div style={{ maxWidth: 560, margin: '0 auto' }}>
              {phase === 'typing' && (
                <div className="comp-typing">
                  {t('battle.compTyping')}{' '}
                  <span className="comp-progress">{'●'.repeat(compProgress)}</span>
                </div>
              )}
              <Input
                autoFocus
                size="large"
                disabled={phase !== 'typing'}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  typedRef.current = e.target.value;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phase === 'typing' && typed.trim()) resolveRound(false);
                }}
                placeholder={phase === 'typing' ? t('battle.phInput') : t('battle.phReady')}
                style={{ fontSize: 17, textAlign: 'center' }}
              />
              <Button
                type="primary"
                block
                size="large"
                style={{ marginTop: 10 }}
                disabled={phase !== 'typing' || !typed.trim()}
                onClick={() => resolveRound(false)}
              >
                {t('battle.submit')}
              </Button>
            </div>
          )}
        </Card>
      )}
    </Space>
  );
}
