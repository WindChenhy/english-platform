/** 背单词页：选词书 → 每日队列（新词四选一 + 到期翻面自评），FSRS 结算；支持弱项训练与中断恢复。 */
import { useQuery } from '@tanstack/react-query';
import {
  App,
  Alert,
  Badge,
  Button,
  Card,
  Col,
  InputNumber,
  Progress,
  Result,
  Row,
  Segmented,
  Space,
  Spin,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, Book, QueueItem, QueueItemNew, QueueItemReview } from '../api';
import LevelTag from '../components/LevelTag';
import NewCard from '../components/study/NewCard';
import ReviewCard from '../components/study/ReviewCard';
import { useStudyStore } from '../store';

type Phase = 'select' | 'session' | 'done';

export default function Study() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    newLimit,
    setNewLimit,
    newDirection,
    setNewDirection,
    reviewLimit,
    setReviewLimit,
    studySession,
    saveStudySession,
    clearStudySession,
  } = useStudyStore();
  const { data: books, isLoading } = useQuery({ queryKey: ['books'], queryFn: api.books });

  const [phase, setPhase] = useState<Phase>('select');
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useState<'normal' | 'weak'>('normal');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState({ review: 0, new: 0 });
  const [answers, setAnswers] = useState<Record<number, { choice: number; correct: boolean }>>({});
  const [newRight, setNewRight] = useState(0);
  const [newWrong, setNewWrong] = useState(0);
  const [reviewDone, setReviewDone] = useState(0);
  const [reveals, setReveals] = useState<Record<number, boolean>>({});
  const [sessionBookId, setSessionBookId] = useState<number | null>(null);

  /** 会话状态变化时写入本地快照，刷新后可继续。 */
  useEffect(() => {
    if (phase === 'session' && items.length > 0) {
      saveStudySession({
        bookId: sessionBookId,
        mode,
        items,
        idx,
        counts,
        answers,
        reveals,
        newRight,
        newWrong,
        reviewDone,
        savedAt: Date.now(),
      });
    }
  }, [phase, items, idx, answers, reveals, newRight, newWrong, reviewDone, sessionBookId, mode, counts, saveStudySession]);

  /** 从本地快照恢复未完成会话。 */
  function resumeSession() {
    if (!studySession) return;
    setSessionBookId(studySession.bookId);
    setMode(studySession.mode);
    setItems(studySession.items);
    setIdx(studySession.idx);
    setCounts(studySession.counts);
    setAnswers(studySession.answers);
    setReveals(studySession.reveals);
    setNewRight(studySession.newRight);
    setNewWrong(studySession.newWrong);
    setReviewDone(studySession.reviewDone);
    setPhase('session');
  }

  /** 拉取学习队列并进入会话；bookId 为 null 表示只复习到期/弱项卡片。 */
  async function beginQueue(bookId: number | null, queueMode: 'normal' | 'weak' = 'normal') {
    setStarting(true);
    try {
      const q = await api.queue(
        bookId,
        bookId && queueMode === 'normal' ? newLimit : 0,
        bookId ? newDirection : 'e2c',
        queueMode,
        reviewLimit,
      );
      if (q.items.length === 0) {
        message.info(
          queueMode === 'weak'
            ? t('study.emptyWeak')
            : bookId
              ? t('study.emptyBook')
              : t('study.emptyReview'),
        );
        return;
      }
      setSessionBookId(bookId);
      setMode(queueMode);
      setItems(q.items);
      setIdx(0);
      setCounts(q.counts);
      setAnswers({});
      setNewRight(0);
      setNewWrong(0);
      setReviewDone(0);
      setReveals({});
      setPhase('session');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  function exitSession() {
    clearStudySession();
    setPhase('select');
  }

  function finishSession() {
    clearStudySession();
    setPhase('done');
  }

  /** 新词四选一作答：按题型比对正确项，答对记 3 答错记 1 并提交 FSRS 结算。 */
  async function rateNew(item: QueueItemNew, choice: number) {
    if (answers[idx]) return;
    const expected = item.quiz === 'c2e' ? item.word : item.meaning;
    const correct = item.options[choice] === expected;
    setAnswers((s) => ({ ...s, [idx]: { choice, correct } }));
    if (correct) setNewRight((v) => v + 1);
    else setNewWrong((v) => v + 1);
    try {
      await api.review({ kind: 'new', word: item.word, rating: correct ? 3 : 1, book_id: item.book_id });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  /** 复习卡三档自评（1 忘了 / 2 模糊 / 3 记得），提交后进入下一项。 */
  async function rateReview(item: QueueItemReview, rating: 1 | 2 | 3) {
    setReviewDone((v) => v + 1);
    try {
      await api.review({ kind: 'review', word: item.word, rating });
    } catch (e) {
      message.error((e as Error).message);
    }
    goNext();
  }

  /** 前进到队列下一项；走完则进入本轮总结页。 */
  function goNext() {
    if (idx + 1 >= items.length) finishSession();
    else setIdx(idx + 1);
  }

  /** 挂起当前复习卡，跳到下一项。 */
  async function suspendCurrent(item: QueueItemReview) {
    try {
      await api.suspendCard(item.word, 7);
      message.success(t('study.suspended', { w: item.word }));
      goNext();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  /** 埋藏当前复习卡（今日不再出现）。 */
  async function buryCurrent(item: QueueItemReview) {
    try {
      await api.buryCard(item.word, 1);
      message.success(t('study.buried', { w: item.word }));
      goNext();
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  // Anki 风格键盘快捷键：空格 翻面/继续，1-3 评分，A-D 或 1-4 选项
  useEffect(() => {
    if (phase !== 'session') return;
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      const item = items[idx];
      if (!item) return;
      if (item.type === 'new') {
        const answered = answers[idx];
        if (!answered) {
          const map: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, '1': 0, '2': 1, '3': 2, '4': 3 };
          const k = e.key.toLowerCase();
          if (k in map) {
            e.preventDefault();
            rateNew(item, map[k]);
          }
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          goNext();
        }
      } else {
        if (!reveals[idx]) {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            setReveals((s) => ({ ...s, [idx]: true }));
          }
        } else {
          const grade = ({ '1': 1, '2': 2, '3': 3, ' ': 3 } as Record<string, 1 | 2 | 3>)[e.key];
          if (grade) {
            e.preventDefault();
            rateReview(item, grade);
          }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, items, idx, answers, reveals]);

  // ---------- 会话进行中 ----------
  if (phase === 'session' && items.length > 0) {
    const item = items[idx];
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={16}>
        <Card size="small" style={{ background: '#fff' }}>
          <Row align="middle" gutter={12}>
            <Col flex="auto">
              <Progress percent={Math.round((idx / items.length) * 100)} showInfo={false} />
            </Col>
            <Col>
              <Typography.Text strong>
                {idx + 1} / {items.length}
              </Typography.Text>
            </Col>
            <Col>
              <Button size="small" onClick={exitSession}>
                {t('common.exit')}
              </Button>
            </Col>
          </Row>
        </Card>
        <Card className="study-paper" style={{ minHeight: 430 }}>
          {item.type === 'new' ? (
            <NewCard
              key={idx}
              item={item}
              answered={answers[idx]}
              onChoose={(c) => rateNew(item, c)}
              onNext={goNext}
            />
          ) : (
            <ReviewCard
              key={idx}
              item={item}
              revealed={!!reveals[idx]}
              onReveal={() => setReveals((s) => ({ ...s, [idx]: true }))}
              onRate={(r) => rateReview(item, r)}
              onSuspend={() => suspendCurrent(item)}
              onBury={() => buryCurrent(item)}
            />
          )}
        </Card>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', fontSize: 12 }}
        >
          {mode === 'weak' ? t('study.weakBanner') : t('study.roundInfo', { n: counts.new, m: counts.review })}
        </Typography.Text>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', fontSize: 12 }}
        >
          {t('study.shortcutHint')}
        </Typography.Text>
      </Space>
    );
  }

  // ---------- 本轮结束 ----------
  if (phase === 'done') {
    return (
      <Result
        status="success"
        title={t('study.doneTitle')}
        subTitle={t('study.doneSub', {
          learned: newRight + newWrong,
          right: newRight,
          reviewed: reviewDone,
        })}
        extra={[
          <Button key="home" type="primary" onClick={() => navigate('/')}>
            {t('common.back')}
          </Button>,
          <Button key="again" onClick={() => setPhase('select')}>
            {t('study.again')}
          </Button>,
        ]}
      />
    );
  }

  // ---------- 选择词书 ----------
  return (
    <div>
      {studySession && studySession.idx < studySession.items.length && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message={t('study.resumeMsg', {
            n: studySession.items.length - studySession.idx,
          })}
          action={
            <Space>
              <Button size="small" type="primary" onClick={resumeSession}>
                {t('study.resumeBtn')}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  clearStudySession();
                  message.info(t('study.resumeDiscarded'));
                }}
              >
                {t('study.resumeDiscard')}
              </Button>
            </Space>
          }
        />
      )}
      <Card size="small" style={{ marginBottom: 16, background: '#fff' }}>
        <Row align="middle" justify="space-between" style={{ marginBottom: 10 }}>
          <Col>
            <Typography.Text type="secondary">{t('study.desc')}</Typography.Text>
          </Col>
          <Col>
            <Space>
              <Button loading={starting} onClick={() => beginQueue(null, 'weak')}>
                {t('study.weakTrain')}
              </Button>
              <Button onClick={() => beginQueue(null)} loading={starting}>
                {t('study.reviewOnly')}
              </Button>
            </Space>
          </Col>
        </Row>
        <Row align="middle" justify="space-between">
          <Col>
            <Space>
              <Typography.Text type="secondary">{t('study.direction')}</Typography.Text>
              <Segmented
                value={newDirection}
                onChange={(v) => setNewDirection(v as 'e2c' | 'c2e' | 'mixed')}
                options={[
                  { label: t('study.e2c'), value: 'e2c' },
                  { label: t('study.c2e'), value: 'c2e' },
                  { label: t('study.mixed'), value: 'mixed' },
                ]}
              />
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Typography.Text type="secondary">{t('study.dailyNew')}</Typography.Text>
              <InputNumber min={3} max={50} value={newLimit} onChange={(v) => setNewLimit(v ?? 10)} />
              <Typography.Text type="secondary">{t('study.dailyReview')}</Typography.Text>
              <InputNumber
                min={10}
                max={200}
                value={reviewLimit}
                onChange={(v) => setReviewLimit(v ?? 60)}
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {isLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : (
        <Row gutter={[14, 14]}>
          {(books ?? []).map((b: Book) => (
            <Col xs={24} sm={12} key={b.id}>
              <Card
                style={{ background: '#fff' }}
                title={
                  <Space>
                    {b.name}
                    <LevelTag level={b.level} />
                  </Space>
                }
                actions={[
                  <Badge key="btn" count={b.due_now} size="small" offset={[-4, 4]}>
                    <Button type="primary" loading={starting} onClick={() => beginQueue(b.id)}>
                      {t('study.start')}
                    </Button>
                  </Badge>,
                ]}
              >
                <Progress
                  percent={Math.round((b.learned / Math.max(b.total, 1)) * 100)}
                  format={(p) => `${b.learned}/${b.total}（${p}%）`}
                />
                <Typography.Text type="secondary">
                  {t('study.mastered', { n: b.mastered, m: b.due_now })}
                </Typography.Text>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
