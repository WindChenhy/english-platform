/**
 * 口语单词练习（由 Speaking 页以「单词练习」模式挂载，无独立路由）。
 * 流程：选词源 → 生成词表 → 逐词播放标准音 / 发音评分 / 录音对比。
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioOutlined,
  PlayCircleOutlined,
  SoundOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  InputNumber,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Book, DictationItem } from '../api';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { usePronouncePractice } from '../hooks/usePronouncePractice';
import { speak } from '../speech';

type Source = 'book' | 'wordlist' | 'weak';

export default function WordPractice() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { data: books } = useQuery({ queryKey: ['books'], queryFn: api.books });
  const { data: overview } = useQuery({
    queryKey: ['dictation-overview'],
    queryFn: api.dictationOverview,
  });

  const [source, setSource] = useState<Source>('book');
  const [bookId, setBookId] = useState<number | undefined>(undefined);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DictationItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [scores, setScores] = useState<number[]>([]);

  const recorder = useAudioRecorder();
  const pronounce = usePronouncePractice();

  const current = items[idx];

  async function start() {
    setLoading(true);
    try {
      const body: Parameters<typeof api.dictationQuiz>[0] = { kind: 'word', count };
      if (source === 'book') {
        if (!bookId) {
          message.info(t('speaking.needBook'));
          setLoading(false);
          return;
        }
        body.source = 'book';
        body.book_id = bookId;
      } else {
        body.source = source;
      }
      const r = await api.dictationQuiz(body);
      if (!r.items.length) {
        message.info(t('speaking.emptyWords'));
        return;
      }
      setItems(r.items);
      setIdx(0);
      pronounce.clear();
      setScores([]);
      recorder.reset();
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function practicePronounce() {
    if (!current) return;
    const result = await pronounce.practice(current.answer);
    if (result) {
      setScores((s) => {
        const n = [...s];
        n[idx] = result.score;
        return n;
      });
      queryClient.invalidateQueries({ queryKey: ['speaking-stats'] });
    }
  }

  async function toggleRecord() {
    if (!current) return;
    if (recorder.recording) {
      const r = await recorder.stop();
      try {
        await api.saveSpeakingRecord({
          target_text: current.answer,
          transcript: pronounce.result?.transcript ?? '',
          score: pronounce.result?.score ?? 0,
          duration_ms: r.durationMs,
          audio: r.blob,
        });
        queryClient.invalidateQueries({ queryKey: ['speaking-records'] });
        message.success(t('speaking.recordSaved'));
      } catch (e) {
        message.error((e as Error).message);
      }
      return;
    }
    if (!recorder.supported) {
      message.warning(t('speaking.micUnsupported'));
      return;
    }
    try {
      await recorder.start();
    } catch (e) {
      message.error(t('speaking.micDenied', { msg: (e as Error).message }));
    }
  }

  function goNext() {
    if (idx + 1 >= items.length) {
      const done = scores.filter((s) => s != null);
      if (done.length) {
        const avg = Math.round(done.reduce((a, b) => a + b, 0) / done.length);
        message.success(t('speaking.sessionDone', { n: done.length, s: avg }));
      }
      setItems([]);
      setIdx(0);
      pronounce.clear();
      return;
    }
    setIdx(idx + 1);
    pronounce.clear();
    recorder.reset();
  }

  if (!current) {
    return (
      <Card title={t('speaking.wordPracticeTitle')} style={{ background: '#fff' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('speaking.wordPracticeDesc')}</Typography.Text>
          <Row align="middle">
            <Col span={6}>
              <Typography.Text type="secondary">{t('speaking.source')}</Typography.Text>
            </Col>
            <Col span={18}>
              <Segmented
                block
                value={source}
                onChange={(v) => setSource(v as Source)}
                options={[
                  { label: t('speaking.srcBook'), value: 'book' },
                  { label: t('speaking.srcWordlist', { n: overview?.wordlist_count ?? 0 }), value: 'wordlist' },
                  { label: t('speaking.srcWeak'), value: 'weak' },
                ]}
              />
            </Col>
          </Row>
          {source === 'book' && (
            <Row align="middle">
              <Col span={6}>
                <Typography.Text type="secondary">{t('speaking.book')}</Typography.Text>
              </Col>
              <Col span={18}>
                <Select
                  style={{ width: '100%' }}
                  placeholder={t('speaking.needBook')}
                  value={bookId}
                  onChange={setBookId}
                  options={(books ?? []).map((b: Book) => ({ value: b.id, label: b.name }))}
                />
              </Col>
            </Row>
          )}
          <Row align="middle">
            <Col span={6}>
              <Typography.Text type="secondary">{t('speaking.count')}</Typography.Text>
            </Col>
            <Col span={18}>
              <InputNumber min={5} max={50} value={count} onChange={(v) => setCount(v ?? 10)} />
            </Col>
          </Row>
          <Button type="primary" block size="large" loading={loading} onClick={start}>
            {t('speaking.startWords')}
          </Button>
        </Space>
      </Card>
    );
  }

  const isDone = !!pronounce.result;
  const nextLabel = idx + 1 >= items.length ? t('speaking.finish') : t('speaking.next');

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={14}>
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
            <Button size="small" onClick={() => setItems([])}>
              {t('common.exit')}
            </Button>
          </Col>
        </Row>
      </Card>

      <Card className="study-paper">
        <Space direction="vertical" size={12} style={{ width: '100%', textAlign: 'center' }}>
          <Tag color="purple">{t('speaking.wordPracticeTitle')}</Tag>
          <div
            style={{
              fontSize: 36,
              fontWeight: 650,
              fontFamily: 'var(--font-serif)',
              color: 'var(--ink)',
            }}
          >
            {current.answer}
          </div>
          <Typography.Text type="secondary">{current.prompt}</Typography.Text>

          <Space wrap style={{ justifyContent: 'center' }}>
            <Button icon={<SoundOutlined />} onClick={() => speak(current.answer)}>
              {t('speaking.playStd')}
            </Button>
            <Button
              type="primary"
              icon={<AudioOutlined />}
              loading={pronounce.busy}
              onClick={practicePronounce}
            >
              {t('speaking.practiceBtn')}
            </Button>
            <Button
              danger={recorder.recording}
              icon={recorder.recording ? <StopOutlined /> : <AudioOutlined />}
              onClick={toggleRecord}
            >
              {recorder.recording ? t('speaking.stopRec') : t('speaking.startRec')}
            </Button>
            {recorder.url && !recorder.recording && (
              <Button
                icon={<PlayCircleOutlined />}
                onClick={() => void new Audio(recorder.url!).play()}
              >
                {t('speaking.myVoice')}
              </Button>
            )}
          </Space>

          {pronounce.result && (
            <Card
              size="small"
              title={t('speaking.scoreTitle', { n: pronounce.result.score })}
              style={{ textAlign: 'left' }}
            >
              <Progress
                percent={pronounce.result.score}
                strokeColor={
                  pronounce.result.score >= 80
                    ? '#3b8c5a'
                    : pronounce.result.score >= 60
                      ? '#d98f2b'
                      : '#d64550'
                }
              />
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                {t('speaking.transcript')}：{pronounce.result.transcript || '—'}
              </Typography.Text>
              {pronounce.result.missing.length > 0 && (
                <Typography.Text type="danger" style={{ display: 'block' }}>
                  {t('speaking.missing')}：{pronounce.result.missing.join(', ')}
                </Typography.Text>
              )}
            </Card>
          )}

          <Button type="primary" size="large" onClick={goNext}>
            {nextLabel}
          </Button>
        </Space>
      </Card>
    </Space>
  );
}
