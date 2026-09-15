/** 默写拼写页：单词/短语/句子三种模式，出题设置 → 逐题默写 → 判分批改 → 总结重练。 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { SoundOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  Input,
  InputNumber,
  Progress,
  Result,
  Row,
  Segmented,
  Select,
  Space,
  Typography,
} from 'antd';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, Book, DictationItem, DictationKind } from '../api';
import { gradeAnswer, maskAnswer } from '../grade';
import { speak } from '../speech';
import { useTranslation } from 'react-i18next';

type Phase = 'setup' | 'session' | 'done';

export default function Dictation() {
  const { message } = App.useApp();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: books } = useQuery({ queryKey: ['books'], queryFn: api.books });
  const { data: overview } = useQuery({
    queryKey: ['dictation-overview'],
    queryFn: api.dictationOverview,
  });

  const [phase, setPhase] = useState<Phase>('setup');
  const [kind, setKind] = useState<DictationKind>('word');
  const [wordSource, setWordSource] = useState<'book' | 'wordlist' | 'weak'>('book');
  const [bookId, setBookId] = useState<number | undefined>();
  const [level, setLevel] = useState<string | undefined>();
  const [count, setCount] = useState(10);
  const [hintOn, setHintOn] = useState(true);
  const [promptMode, setPromptMode] = useState<'zh' | 'audio' | 'mixed'>('zh');
  const [loading, setLoading] = useState(false);

  const [items, setItems] = useState<DictationItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [graded, setGraded] = useState<Record<number, { ok: boolean; skipped: boolean }>>({});
  const [submitted, setSubmitted] = useState<Record<number, string>>({});
  const [wrongItems, setWrongItems] = useState<DictationItem[]>([]);
  const [modes, setModes] = useState<('zh' | 'audio')[]>([]); // 每题的提示方式（mixed 时逐题随机）
  const submitLockRef = useRef(false); // 防止同一题重复提交导致错题重复入队

  const addWord = useMutation({
    mutationFn: (w: string) => api.addWordlist(w),
    onSuccess: (r) => {
      message.success(r.created ? t('dict.added') : t('dict.already'));
    },
    onError: (e) => message.error((e as Error).message),
  });

  /** 按当前设置请求出题并进入会话；传入 custom（错题列表）时直接重练。 */
  async function startQuiz(custom?: DictationItem[]) {
    const rollModes = (list: DictationItem[]) =>
      list.map(() => (promptMode === 'mixed' ? (Math.random() < 0.5 ? 'zh' : 'audio') : promptMode) as 'zh' | 'audio');
    if (custom) {
      setItems(custom);
      setModes(rollModes(custom));
      setIdx(0);
      setTyped('');
      setGraded({});
      setSubmitted({});
      setWrongItems([]);
      submitLockRef.current = false;
      setPhase('session');
      return;
    }
    setLoading(true);
    try {
      const body: {
        kind: DictationKind;
        count: number;
        source?: 'book' | 'wordlist' | 'weak';
        book_id?: number | null;
        level?: string | null;
      } = { kind, count };
      if (kind === 'word') {
        body.source = wordSource;
        if (wordSource === 'book') body.book_id = bookId;
      } else if (kind === 'phrase') {
        body.book_id = bookId ?? null;
      } else {
        body.level = level ?? null;
      }
      const r = await api.dictationQuiz(body);
      setItems(r.items);
      setModes(rollModes(r.items));
      setIdx(0);
      setTyped('');
      setGraded({});
      setSubmitted({});
      setWrongItems([]);
      submitLockRef.current = false;
      setPhase('session');
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /** 提交当前题：前端判分（grade.ts），答错进入错题列表供重练。 */
  function submit(skipped = false) {
    if (submitLockRef.current || graded[idx]) return;
    submitLockRef.current = true;
    const item = items[idx];
    if (!skipped && !typed.trim()) return;
    const { ok } = gradeAnswer(item.answer, typed);
    setGraded((s) => ({ ...s, [idx]: { ok, skipped } }));
    setSubmitted((s) => ({ ...s, [idx]: typed }));
    if (!ok) setWrongItems((w) => [...w, item]);
    if (ok) speak(item.answer);
  }

  /** 进入下一题；最后一题完成时提交结果并切到总结页。 */
  function next() {
    if (idx + 1 >= items.length) {
      void saveResults();
      setPhase('done');
    } else {
      setIdx(idx + 1);
      setTyped('');
      submitLockRef.current = false;
    }
  }

  /** 把本场判分结果提交后端，用于正确率统计与弱项词。 */
  async function saveResults() {
    try {
      const payload = items.map((it, i) => ({
        kind,
        answer: it.answer,
        correct: !!graded[i]?.ok,
        word: kind === 'word' ? it.answer : it.source,
      }));
      await api.dictationResult(payload);
    } catch {
      /* 静默失败：统计落库不影响本场体验 */
    }
  }

  // 发音听写模式：进入新题自动播放一遍发音
  useEffect(() => {
    if (phase === 'session' && modes[idx] === 'audio' && items[idx]) {
      speak(items[idx].answer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, phase, modes]);

  // ---------- 设置 ----------
  if (phase === 'setup') {
    const wordNeedsBook = kind === 'word' && wordSource === 'book' && !bookId;
    return (
      <Card title={t('dict.title')} style={{ maxWidth: 620, margin: '0 auto', background: '#fff' }}>
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Segmented
            block
            value={kind}
            onChange={(k) => setKind(k as DictationKind)}
            options={[
              { label: t('dict.kindWord'), value: 'word' },
              { label: t('dict.kindPhrase'), value: 'phrase' },
              { label: t('dict.kindSentence'), value: 'sentence' },
            ]}
          />

          {kind === 'word' && (
            <>
              <Row align="middle">
                <Col span={5}>
                  <Typography.Text type="secondary">{t('dict.source')}</Typography.Text>
                </Col>
                <Col span={19}>
                  <Select
                    style={{ width: '100%' }}
                    value={wordSource}
                    onChange={(v) => setWordSource(v)}
                    options={[
                      { value: 'book', label: t('dict.book') },
                      { value: 'wordlist', label: t('dict.wordlistOpt', { n: overview?.wordlist_count ?? 0 }) },
                      { value: 'weak', label: t('dict.weakOpt') },
                    ]}
                  />
                </Col>
              </Row>
              {wordSource === 'book' && (
                <Row align="middle">
                  <Col span={5}>
                    <Typography.Text type="secondary">{t('dict.book')}</Typography.Text>
                  </Col>
                  <Col span={19}>
                    <Select
                      style={{ width: '100%' }}
                      placeholder={t('dict.phSelectBook')}
                      value={bookId}
                      onChange={(v) => setBookId(v)}
                      options={(books ?? []).map((b: Book) => ({ value: b.id, label: b.name }))}
                    />
                  </Col>
                </Row>
              )}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('dict.descWord')}
              </Typography.Text>
            </>
          )}

          {kind === 'phrase' && (
            <>
              <Row align="middle">
                <Col span={5}>
                  <Typography.Text type="secondary">{t('dict.source')}</Typography.Text>
                </Col>
                <Col span={19}>
                  <Select
                    style={{ width: '100%' }}
                    allowClear
                    placeholder={t('dict.allBooks')}
                    value={bookId}
                    onChange={(v) => setBookId(v)}
                    options={(books ?? []).map((b: Book) => ({
                      value: b.id,
                      label: t('dict.bookOpt', { name: b.name, n: overview?.phrase_by_book[String(b.id)] ?? 0 }),
                    }))}
                  />
                </Col>
              </Row>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('dict.descPhrase')}
              </Typography.Text>
            </>
          )}

          {kind === 'sentence' && (
            <>
              <Row align="middle">
                <Col span={5}>
                  <Typography.Text type="secondary">{t('dict.levelLabel')}</Typography.Text>
                </Col>
                <Col span={19}>
                  <Select
                    style={{ width: '100%' }}
                    allowClear
                    placeholder={t('dict.allLevels')}
                    value={level}
                    onChange={(v) => setLevel(v)}
                    options={Object.entries(overview?.sentence_by_level ?? {}).map(([lv, n]) => ({
                      value: lv,
                      label: t('dict.levelOpt', { level: t(`common.level.${lv}`), n }),
                    }))}
                  />
                </Col>
              </Row>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {t('dict.descSentence')}
              </Typography.Text>
            </>
          )}

          <Row align="middle">
            <Col span={5}>
              <Typography.Text type="secondary">{t('dict.promptMode')}</Typography.Text>
            </Col>
            <Col span={19}>
              <Segmented
                size="small"
                value={promptMode}
                onChange={(v) => setPromptMode(v as 'zh' | 'audio' | 'mixed')}
                options={[
                  { label: t('dict.pmZh'), value: 'zh' },
                  { label: t('dict.pmAudio'), value: 'audio' },
                  { label: t('dict.pmMixed'), value: 'mixed' },
                ]}
              />
            </Col>
          </Row>

          <Row align="middle" justify="space-between">
            <Col>
              <Space>
                <Typography.Text type="secondary">{t('dict.count')}</Typography.Text>
                <InputNumber min={1} max={50} value={count} onChange={(v) => setCount(v ?? 10)} />
              </Space>
            </Col>
            <Col>
              <Checkbox checked={hintOn} onChange={(e) => setHintOn(e.target.checked)}>
                {t('dict.hint')}
              </Checkbox>
            </Col>
          </Row>

          <Button
            type="primary"
            block
            size="large"
            loading={loading}
            disabled={wordNeedsBook}
            onClick={() => startQuiz()}
          >
            {t('dict.start')}
          </Button>
        </Space>
      </Card>
    );
  }

  // ---------- 会话 ----------
  if (phase === 'session' && items.length > 0) {
    const item = items[idx];
    const g = graded[idx];
    const submittedText = submitted[idx] ?? '';
    const tokens = g ? gradeAnswer(item.answer, submittedText).tokens : [];
    const audio = modes[idx] === 'audio';
    const kindLabel = kind === 'word' ? t('dict.kindWord') : kind === 'phrase' ? t('dict.kindPhrase') : t('dict.kindSentence');

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
              <Button size="small" onClick={() => setPhase('setup')}>
                {t('common.exit')}
              </Button>
            </Col>
          </Row>
        </Card>

        <Card className="study-paper" style={{ minHeight: 340 }}>
          <div style={{ textAlign: 'center' }}>
            <span className="eyebrow" style={{ letterSpacing: 2 }}>
              {kindLabel}
              {item.source ? ` · ${item.source}` : ''}
            </span>
            {audio ? (
              <div style={{ padding: '12px 0 6px' }}>
                <Button
                  size="large"
                  shape="circle"
                  icon={<SoundOutlined />}
                  onClick={() => speak(item.answer)}
                />
                <div className="eyebrow" style={{ marginTop: 8, letterSpacing: 2 }}>
                  {t('dict.audioEyebrow')}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t('dict.audioHint')}
                </Typography.Text>
              </div>
            ) : (
              <div
                style={{
                  fontSize: 25,
                  fontWeight: 650,
                  color: 'var(--ink)',
                  lineHeight: 1.65,
                  maxWidth: 660,
                  margin: '6px auto 8px',
                }}
              >
                {item.prompt}
              </div>
            )}
            {hintOn && (
              <div className="study-phonetic" style={{ letterSpacing: 2 }}>
                {maskAnswer(item.answer)}
              </div>
            )}
          </div>

          <div style={{ maxWidth: 640, margin: '10px auto 0' }}>
            {kind === 'sentence' ? (
              <Input.TextArea
                key={idx}
                autoFocus
                autoSize={{ minRows: 2, maxRows: 4 }}
                readOnly={!!g}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    g ? next() : submit();
                  }
                }}
                placeholder={t('dict.phSentence')}
                style={{ fontSize: 16 }}
              />
            ) : (
              <Input
                key={idx}
                autoFocus
                size="large"
                readOnly={!!g}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    g ? next() : submit();
                  }
                }}
                placeholder={t('dict.phWord')}
                style={{ fontSize: 17 }}
              />
            )}

            {!g && (
              <Row justify="center" gutter={12} style={{ marginTop: 12 }}>
                <Col>
                  <Button type="primary" disabled={!typed.trim()} onClick={() => submit()}>
                    {t('dict.submit')}
                  </Button>
                </Col>
                <Col>
                  <Button onClick={() => submit(true)}>{t('dict.showAnswer')}</Button>
                </Col>
              </Row>
            )}

            {g && (
              <div style={{ marginTop: 14 }}>
                <div
                  className="hand-verdict"
                  style={{ color: g.ok ? 'var(--green-ink)' : 'var(--red-pen)' }}
                >
                  {g.ok ? t('dict.vOk') : g.skipped ? t('dict.vSkipped') : t('dict.vWrong')}
                </div>

                {!g.ok && (
                  <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    <span className="eyebrow">{t('dict.reviewMark')}</span>
                    <div
                      style={{
                        textAlign: 'left',
                        background: '#fff',
                        border: '1px solid var(--rule)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        fontFamily: 'var(--font-serif)',
                        fontSize: 16,
                        lineHeight: 1.9,
                      }}
                    >
                      {tokens.map((tk, i) =>
                        tk.status === 'ok' ? (
                          <span key={i}>{tk.word} </span>
                        ) : tk.status === 'missing' ? (
                          <span
                            key={i}
                            style={{ color: 'var(--green-ink)', fontWeight: 600, textDecoration: 'underline dotted' }}
                          >
                            {tk.word}{' '}
                          </span>
                        ) : (
                          <span key={i} style={{ color: 'var(--red-pen)', textDecoration: 'line-through' }}>
                            {tk.word}{' '}
                          </span>
                        ),
                      )}
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      <span style={{ color: 'var(--red-pen)' }}>{t('dict.legendWrong')}</span> ·{' '}
                      <span style={{ color: 'var(--green-ink)' }}>{t('dict.legendMissing')}</span>
                    </Typography.Text>
                  </div>
                )}

                <div style={{ textAlign: 'center' }}>
                  {/* 听写模式：判分后揭示中文释义 */}
                  {audio && <Typography.Text type="secondary">{item.prompt}</Typography.Text>}
                  <span className="eyebrow" style={{ display: 'block', marginTop: 6 }}>
                    {t('dict.correctAnswer')}
                  </span>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--green-ink)' }}>
                    {item.answer}
                  </div>
                  <Space style={{ marginTop: 6 }}>
                    <Button size="small" icon={<SoundOutlined />} onClick={() => speak(item.answer)}>
                      {t('dict.listen')}
                    </Button>
                    {kind === 'word' && !g.ok && (
                      <Button size="small" loading={addWord.isPending} onClick={() => addWord.mutate(item.answer)}>
                        {t('dict.collect')}
                      </Button>
                    )}
                  </Space>
                </div>

                <Button type="primary" block size="large" style={{ marginTop: 16 }} onClick={next}>
                  {idx + 1 >= items.length ? t('dict.finish') : t('dict.nextBtn')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </Space>
    );
  }

  // ---------- 完成 ----------
  if (phase === 'done') {
    const wrongCount = Object.values(graded).filter((g) => !g.ok).length;
    return (
      <Result
        status="success"
        title={t('dict.doneTitle')}
        subTitle={t('dict.doneSub', { total: items.length, ok: items.length - wrongCount })}
        extra={[
          wrongItems.length > 0 ? (
            <Button key="retry" onClick={() => startQuiz(wrongItems)}>
              {t('dict.retry', { n: wrongItems.length })}
            </Button>
          ) : (
            <Button key="again" onClick={() => setPhase('setup')}>
              {t('dict.again')}
            </Button>
          ),
          <Button key="setup" onClick={() => setPhase('setup')}>
            {t('dict.changeRange')}
          </Button>,
          <Button key="home" type="primary" onClick={() => navigate('/')}>
            {t('common.back')}
          </Button>,
        ]}
      />
    );
  }

  return (
    <div style={{ textAlign: 'center', padding: 60 }} />
  );
}
