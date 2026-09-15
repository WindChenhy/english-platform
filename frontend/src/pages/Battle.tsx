/**
 * 单词拼写对打页：用户 vs 电脑，各 5 颗❤️。
 * 回合/血量/计时逻辑见 hooks/useBattleEngine；本页只负责设置、对战与结算 UI。
 */
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Input, Result, Row, Segmented, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, Book } from '../api';
import {
  DIFFS,
  FLASH_SECONDS,
  MAX_HP,
  ROUND_SECONDS,
  useBattleEngine,
  type BattleDifficulty,
} from '../hooks/useBattleEngine';
import { useStudyStore } from '../store';

/** 渲染血量：满血 ❤️ / 已扣 🖤，共 MAX_HP 颗。 */
function hearts(hp: number): string {
  return Array.from({ length: MAX_HP }, (_, i) => (i < hp ? '❤️' : '🖤')).join(' ');
}

export default function Battle() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: books } = useQuery({ queryKey: ['books'], queryFn: api.books });
  const { data: battleCfg } = useQuery({ queryKey: ['battle-config'], queryFn: api.battleConfig });
  const { battleAvatar, setBattleAvatar } = useStudyStore();

  const [diff, setDiff] = useState<BattleDifficulty | null>(null);
  const [bookId, setBookId] = useState<number | undefined>(3);
  const effectiveDiff: BattleDifficulty = diff ?? battleCfg?.suggested ?? 'normal';

  const engine = useBattleEngine(effectiveDiff);
  const {
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
  } = engine;

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  // 回合结算后停留 5 秒再自动进入下一回合（或战局结算），期间可跳过
  useEffect(() => {
    if (phase !== 'roundResult') return;
    setNextIn(5);
    const deadline = Date.now() + 5000;
    const timer = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setNextIn(left);
      if (left <= 0) {
        clearInterval(timer);
        handleNextRef.current();
      }
    }, 200);
    return () => clearInterval(timer);
  }, [phase, setNextIn]);

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
                  value={effectiveDiff}
                  onChange={(v) => setDiff(v as BattleDifficulty)}
                  options={(Object.keys(DIFFS) as BattleDifficulty[]).map((k) => ({
                    value: k,
                    label: t(`battle.${k}`),
                  }))}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {battleCfg?.win_rate != null
                    ? t('battle.suggested', {
                        d: t(`battle.${battleCfg.suggested}`),
                        r: Math.round(battleCfg.win_rate * 100),
                      })
                    : t(`battle.${effectiveDiff}Desc`)}
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
            <Button
              type="primary"
              block
              size="large"
              loading={starting}
              onClick={() => void startGame(bookId)}
            >
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
          <Button key="again" type="primary" onClick={() => void startGame(bookId)}>
            {t('battle.again')}
          </Button>,
          <Button key="setup" onClick={surrender}>
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
              {t('battle.comp')} · {t(`battle.${effectiveDiff}`)}
            </div>
            <div className="hp-hearts">{hearts(compHp)}</div>
          </Col>
        </Row>
        <div className="arena-floor" />
      </Card>

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
              onClick={surrender}
            >
              {t('battle.surrender')}
            </Button>
            <Button
              type="text"
              size="small"
              style={{ marginLeft: 4, color: 'var(--amber-ink)' }}
              loading={starting}
              onClick={() => void startGame(bookId)}
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
                onChange={(e) => setTypedValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phase === 'typing' && typed.trim()) submitTyped();
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
                onClick={submitTyped}
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
