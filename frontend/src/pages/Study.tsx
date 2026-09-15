/** 背单词页：选词书 → 每日队列（新词四选一 + 到期翻面自评），SM-2 结算。 */
import { useQuery } from '@tanstack/react-query';
import { CheckCircleFilled, CloseCircleFilled, SoundOutlined } from '@ant-design/icons';
import {
  App,
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
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, Book, QueueItem, QueueItemNew, QueueItemReview } from '../api';
import { speak } from '../speech';
import { useStudyStore } from '../store';

const LETTERS = ['A', 'B', 'C', 'D'];
const LEVEL_COLOR: Record<string, string> = { beginner: '#3b8c5a', cet4: '#2b4c7e', cet6: '#6b4fa0' };

type Phase = 'select' | 'session' | 'done';

export default function Study() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { newLimit, setNewLimit, newDirection, setNewDirection } = useStudyStore();
  const { data: books, isLoading } = useQuery({ queryKey: ['books'], queryFn: api.books });

  const [phase, setPhase] = useState<Phase>('select');
  const [starting, setStarting] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [counts, setCounts] = useState({ review: 0, new: 0 });
  const [answers, setAnswers] = useState<Record<number, { choice: number; correct: boolean }>>({});
  const [newRight, setNewRight] = useState(0);
  const [newWrong, setNewWrong] = useState(0);
  const [reviewDone, setReviewDone] = useState(0);
  const [reveals, setReveals] = useState<Record<number, boolean>>({});

  /** 拉取学习队列并进入会话；bookId 为 null 表示只复习全部到期卡片。 */
  async function beginQueue(bookId: number | null) {
    setStarting(true);
    try {
      const q = await api.queue(bookId, bookId ? newLimit : 0, bookId ? newDirection : 'e2c');
      if (q.items.length === 0) {
        message.info(bookId ? t('study.emptyBook') : t('study.emptyReview'));
        return;
      }
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

  /** 新词四选一作答：按题型比对正确项，答对记 3 答错记 1 并提交 SM-2 结算。 */
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
    if (idx + 1 >= items.length) setPhase('done');
    else setIdx(idx + 1);
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
              <Button size="small" onClick={() => setPhase('select')}>
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
            />
          )}
        </Card>
        <Typography.Text
          type="secondary"
          style={{ display: 'block', textAlign: 'center', fontSize: 12 }}
        >
          {t('study.roundInfo', { n: counts.new, m: counts.review })}
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
      <Card size="small" style={{ marginBottom: 16, background: '#fff' }}>
        <Row align="middle" justify="space-between" style={{ marginBottom: 10 }}>
          <Col>
            <Typography.Text type="secondary">{t('study.desc')}</Typography.Text>
          </Col>
          <Col>
            <Button onClick={() => beginQueue(null)} loading={starting}>
              {t('study.reviewOnly')}
            </Button>
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
            <Space>
              <Typography.Text type="secondary">{t('study.dailyNew')}</Typography.Text>
              <InputNumber min={3} max={50} value={newLimit} onChange={(v) => setNewLimit(v ?? 10)} />
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
                    <Tag style={{ color: LEVEL_COLOR[b.level], borderColor: LEVEL_COLOR[b.level], background: '#fff' }}>
                      {t(`common.level.${b.level}`)}
                    </Tag>
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

/** 新词卡：英→中（看单词选释义）与中→英（看释义选单词）两种题型共用渲染。 */
function NewCard({
  item,
  answered,
  onChoose,
  onNext,
}: {
  item: QueueItemNew;
  answered?: { choice: number; correct: boolean };
  onChoose: (choice: number) => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const detail = item.detail;
  const isC2E = item.quiz === 'c2e';
  return (
    <div>
      {!isC2E ? (
        <>
          <div style={{ textAlign: 'center' }}>
            <span className="study-word">
              <span className="marker-ink">{item.word}</span>
            </span>
            <Button type="text" icon={<SoundOutlined />} onClick={() => speak(item.word)} />
          </div>
          <div className="study-phonetic">
            {item.phonetic_us ? `/ ${item.phonetic_us} /` : item.phonetic_uk ? `/ ${item.phonetic_uk} /` : ''}
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '20px 0 2px' }}>
          <span className="eyebrow" style={{ letterSpacing: 2 }}>
            {t('study.c2eEyebrow')}
          </span>
          <div
            style={{
              fontSize: 29,
              fontWeight: 650,
              color: 'var(--ink)',
              lineHeight: 1.55,
              maxWidth: 620,
              margin: '4px auto 0',
            }}
          >
            {item.meaning}
          </div>
        </div>
      )}
      {answered && (
        <div
          className="hand-verdict"
          style={{ color: answered.correct ? 'var(--green-ink)' : 'var(--red-pen)' }}
        >
          {answered.correct ? t('study.vRight') : t('study.vWrong')}
        </div>
      )}

      <div style={{ maxWidth: 560, margin: '10px auto 0' }}>
        {item.options.map((opt, i) => {
          const isCorrectOpt = opt === (isC2E ? item.word : item.meaning);
          let style: CSSProperties = {};
          if (answered) {
            if (isCorrectOpt) style = { borderColor: 'var(--green-ink)', background: 'rgba(59,140,90,.07)' };
            else if (i === answered.choice) style = { borderColor: 'var(--red-pen)', background: 'rgba(214,69,80,.06)' };
          }
          return (
            <Button
              key={i}
              block
              className="option-btn"
              disabled={!!answered}
              onClick={() => onChoose(i)}
              style={{ ...style, marginBottom: 8 }}
            >
              <span className="opt-letter">{LETTERS[i]}</span>
              {answered && isCorrectOpt && (
                <CheckCircleFilled style={{ color: 'var(--green-ink)', marginRight: 8 }} />
              )}
              {answered && i === answered.choice && !answered.correct && (
                <CloseCircleFilled style={{ color: 'var(--red-pen)', marginRight: 8 }} />
              )}
              {isC2E ? (
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>{opt}</span>
              ) : (
                opt
              )}
            </Button>
          );
        })}
      </div>

      {answered && (
        <div style={{ marginTop: 14 }}>
          {isC2E && (
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 30,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                <span className="marker-ink">{item.word}</span>
              </span>
              <Button type="text" icon={<SoundOutlined />} onClick={() => speak(item.word)} />
              <div className="study-phonetic" style={{ marginBottom: 4 }}>
                {item.phonetic_us ? `/ ${item.phonetic_us} /` : item.phonetic_uk ? `/ ${item.phonetic_uk} /` : ''}
              </div>
              <Typography.Paragraph strong style={{ maxWidth: 640, margin: '0 auto' }}>
                {item.meaning}
              </Typography.Paragraph>
            </div>
          )}
          {!isC2E && (
            <Typography.Paragraph strong style={{ textAlign: 'center', fontSize: 16 }}>
              {item.meaning}
            </Typography.Paragraph>
          )}
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
            {detail?.sentences && detail.sentences.length > 0 && (
              <div className="detail-block" style={{ textAlign: 'left' }}>
                <span className="eyebrow">{t('study.dSentences')}</span>
                {detail.sentences.map((s, i) => (
                  <div key={i} className="detail-line">
                    <Button
                      size="small"
                      type="text"
                      icon={<SoundOutlined />}
                      onClick={() => speak(s.en)}
                      style={{ margin: 0 }}
                    />
                    <span style={{ fontFamily: 'var(--font-serif)' }}>{s.en}</span>
                    <br />
                    <span className="detail-cn" style={{ marginLeft: 30 }}>
                      {s.zh}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {detail?.phrases && detail.phrases.length > 0 && (
              <div className="detail-block" style={{ textAlign: 'left' }}>
                <span className="eyebrow">{t('study.dPhrases')}</span>
                <div>
                  {detail.phrases.map((p, i) => (
                    <Tag key={i} style={{ marginBottom: 4, background: '#fff' }}>
                      {p.en} <span className="detail-cn">{p.zh}</span>
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {detail?.synonyms && detail.synonyms.length > 0 && (
              <div className="detail-block" style={{ textAlign: 'left' }}>
                <span className="eyebrow">{t('study.dSynonyms')}</span>
                <div>
                  {detail.synonyms.map((s, i) => (
                    <Tag key={i} style={{ marginBottom: 4, background: '#fff', borderColor: 'var(--ink-primary)', color: 'var(--ink-primary)' }}>
                      {s.word} <span className="detail-cn">{s.zh}</span>
                    </Tag>
                  ))}
                </div>
              </div>
            )}
            {detail?.related && detail.related.length > 0 && (
              <div className="detail-block" style={{ textAlign: 'left' }}>
                <span className="eyebrow">{t('study.dRelated')}</span>
                <div>
                  {detail.related.map((r, i) => (
                    <Tag key={i} style={{ marginBottom: 4, background: '#fff' }}>
                      {r.word} <span className="detail-cn">{r.zh}</span>
                    </Tag>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button
            type="primary"
            block
            size="large"
            style={{ marginTop: 18, maxWidth: 560 }}
            onClick={onNext}
          >
            {t('study.next')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** 复习卡：翻面自评（先回想，再翻面按忘了/模糊/记得打分）；翻面状态由父组件控制以支持键盘。 */
function ReviewCard({
  item,
  revealed,
  onReveal,
  onRate,
}: {
  item: QueueItemReview;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: 1 | 2 | 3) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div style={{ textAlign: 'center' }}>
        <span className="study-word">
          <span className="marker-ink">{item.word}</span>
        </span>
        <Button type="text" icon={<SoundOutlined />} onClick={() => speak(item.word)} />
      </div>
      <div className="study-phonetic">
        {item.phonetic ? `/ ${item.phonetic} /` : t('study.reviewFallback')}
      </div>
      {!revealed ? (
        <div style={{ textAlign: 'center', marginTop: 36 }}>
          <Button type="primary" size="large" style={{ paddingInline: 42 }} onClick={onReveal}>
            {t('study.showAnswer')}
          </Button>
          <div className="hand" style={{ marginTop: 14, color: 'var(--ink-soft)', fontSize: 13 }}>
            {t('study.recallHint')}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <Typography.Paragraph
            strong
            style={{ textAlign: 'center', fontSize: 17, maxWidth: 640, margin: '0 auto' }}
          >
            {item.meaning}
          </Typography.Paragraph>
          <Row justify="center" gutter={12} style={{ marginTop: 26 }}>
            <Col>
              <Button danger size="large" style={{ borderWidth: 2, fontWeight: 600 }} onClick={() => onRate(1)}>
                {t('study.rate1')}
              </Button>
            </Col>
            <Col>
              <Button
                size="large"
                style={{ color: 'var(--amber-ink)', borderColor: 'var(--amber-ink)', borderWidth: 2, fontWeight: 600 }}
                onClick={() => onRate(2)}
              >
                {t('study.rate2')}
              </Button>
            </Col>
            <Col>
              <Button
                type="primary"
                size="large"
                style={{ background: 'var(--green-ink)', borderWidth: 2, fontWeight: 600 }}
                onClick={() => onRate(3)}
              >
                {t('study.rate3')}
              </Button>
            </Col>
          </Row>
        </div>
      )}
    </div>
  );
}
