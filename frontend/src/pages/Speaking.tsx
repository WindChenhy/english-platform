/**
 * 日常口语页：
 * - 场景对话：机场/餐厅/酒店/购物/诊所/职场/家庭/学校，播放标准音后跟读；
 * - 单词练习：从词书/生词本/弱项抽词逐个跟读。
 * 两种模式共用 SpeechRecognition 评分与 MediaRecorder 录音，结果写入 SpeakingRecord。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  SoundOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  List,
  Progress,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, SpeakingLine, SpeakingScenarioDetail } from '../api';
import {
  recognizeEnglish,
  scorePronunciation,
  speechRecognitionSupported,
  type PronounceResult,
} from '../pronounce';
import { blobUrl, mediaRecorderSupported, startRecording } from '../record';
import { speak } from '../speech';
import WordPractice from './WordPractice';

const SCENE_ICON: Record<string, string> = {
  airport: '✈️',
  restaurant: '🍽️',
  hotel: '🏨',
  shopping: '🛍️',
  clinic: '🏥',
  work: '💼',
  family: '🏠',
  school: '🏫',
};

type Mode = 'dialogue' | 'words';
type Phase = 'list' | 'practice';

export default function Speaking() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('dialogue');
  const [phase, setPhase] = useState<Phase>('list');
  const [scene, setScene] = useState<string | undefined>();
  const [scenario, setScenario] = useState<SpeakingScenarioDetail | null>(null);
  const [lineIdx, setLineIdx] = useState(0);
  const [rec, setRec] = useState<{ recording: boolean; url?: string; blob?: Blob; ms: number }>({
    recording: false,
    ms: 0,
  });
  const [pron, setPron] = useState<PronounceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const recorderRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const recUrlRef = useRef<string | null>(null);

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ['speaking-scenarios', scene],
    queryFn: () => api.speakingScenarios(scene),
  });
  const { data: records } = useQuery({
    queryKey: ['speaking-records', scenario?.id],
    queryFn: () => api.speakingRecords(scenario?.id),
    enabled: phase === 'practice' && mode === 'dialogue',
  });
  const { data: spStats } = useQuery({
    queryKey: ['speaking-stats'],
    queryFn: api.speakingStats,
  });

  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      if (recUrlRef.current) URL.revokeObjectURL(recUrlRef.current);
    };
  }, []);

  async function openScenario(id: number) {
    try {
      const d = await api.speakingScenario(id);
      setScenario(d);
      setLineIdx(0);
      setPron(null);
      setRec({ recording: false, ms: 0 });
      setPhase('practice');
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  function exitPractice() {
    recorderRef.current?.cancel();
    if (recUrlRef.current) {
      URL.revokeObjectURL(recUrlRef.current);
      recUrlRef.current = null;
    }
    setScenario(null);
    setPhase('list');
  }

  const line: SpeakingLine | undefined = scenario?.lines[lineIdx];

  async function practicePronounce() {
    if (!line || !scenario) return;
    if (!speechRecognitionSupported()) {
      message.warning(t('speaking.asrUnsupported'));
      return;
    }
    setBusy(true);
    try {
      const text = await recognizeEnglish();
      const result = scorePronunciation(line.en, text);
      setPron(result);
      await api.saveSpeakingRecord({
        target_text: line.en,
        transcript: text,
        score: result.score,
        scenario_id: scenario.id,
        line_id: line.id,
      });
      queryClient.invalidateQueries({ queryKey: ['speaking-records'] });
      message.success(t('speaking.scored', { n: result.score }));
    } catch (e) {
      const msg = (e as Error).message;
      message.error(
        msg === 'UNSUPPORTED' ? t('speaking.asrUnsupported') : t('speaking.asrFailed', { msg }),
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecord() {
    if (!line || !scenario) return;
    if (rec.recording) {
      const r = await recorderRef.current!.stop();
      const url = blobUrl(r.blob);
      if (recUrlRef.current) URL.revokeObjectURL(recUrlRef.current);
      recUrlRef.current = url;
      setRec({ recording: false, url, blob: r.blob, ms: r.durationMs });
      try {
        await api.saveSpeakingRecord({
          target_text: line.en,
          transcript: pron?.transcript ?? '',
          score: pron?.score ?? 0,
          scenario_id: scenario.id,
          line_id: line.id,
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
    if (!mediaRecorderSupported()) {
      message.warning(t('speaking.micUnsupported'));
      return;
    }
    try {
      const r = await startRecording();
      recorderRef.current = r;
      setRec({ recording: true, ms: 0 });
    } catch (e) {
      message.error(t('speaking.micDenied', { msg: (e as Error).message }));
    }
  }

  const removeRec = useMutation({
    mutationFn: (id: number) => api.deleteSpeakingRecord(id),
    onSuccess: () => {
      message.success(t('speaking.recDeleted'));
      queryClient.invalidateQueries({ queryKey: ['speaking-records'] });
    },
    onError: (e) => message.error((e as Error).message),
  });

  // ---------- 单词练习模式 ----------
  if (mode === 'words') {
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={14}>
        <Card size="small" style={{ background: '#fff' }}>
          <Space wrap align="center">
            <Typography.Title level={4} style={{ margin: 0 }}>
              {t('speaking.title')}
            </Typography.Title>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as Mode)}
              options={[
                { label: t('speaking.modeDialogue'), value: 'dialogue' },
                { label: t('speaking.modeWords'), value: 'words' },
              ]}
            />
          </Space>
          {!speechRecognitionSupported() && (
            <Alert
              style={{ marginTop: 10 }}
              type="warning"
              showIcon
              message={t('speaking.asrUnsupported')}
            />
          )}
        </Card>
        <WordPractice />
      </Space>
    );
  }

  // ---------- 场景对话练习中 ----------
  if (phase === 'practice' && scenario && line) {
    const isYou = line.role === 'you';
    return (
      <Space direction="vertical" style={{ width: '100%' }} size={14}>
        <Card size="small" style={{ background: '#fff' }}>
          <Row align="middle" gutter={12}>
            <Col flex="auto">
              <Typography.Text strong>
                {SCENE_ICON[scenario.scene] ?? '💬'} {scenario.title}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ marginLeft: 10 }}>
                {lineIdx + 1} / {scenario.lines.length}
              </Typography.Text>
            </Col>
            <Col>
              <Button size="small" onClick={exitPractice}>
                {t('common.exit')}
              </Button>
            </Col>
          </Row>
          <Progress
            percent={Math.round(((lineIdx + 1) / scenario.lines.length) * 100)}
            showInfo={false}
            size="small"
            style={{ marginTop: 8 }}
          />
        </Card>

        <Card className="study-paper">
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Tag color={isYou ? 'blue' : 'default'}>
              {isYou ? t('speaking.roleYou') : t('speaking.rolePartner')}
            </Tag>
            <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.55, fontFamily: 'var(--font-serif)' }}>
              {line.en}
            </div>
            <Typography.Text type="secondary">{line.zh}</Typography.Text>
            {line.tip && (
              <Alert type="info" showIcon message={t('speaking.tip')} description={line.tip} />
            )}

            <Space wrap>
              <Button icon={<SoundOutlined />} onClick={() => speak(line.en)}>
                {t('speaking.playStd')}
              </Button>
              {isYou && (
                <>
                  <Button
                    type="primary"
                    icon={<AudioOutlined />}
                    loading={busy}
                    onClick={practicePronounce}
                  >
                    {t('speaking.practiceBtn')}
                  </Button>
                  <Button
                    danger={rec.recording}
                    icon={rec.recording ? <StopOutlined /> : <AudioOutlined />}
                    onClick={toggleRecord}
                  >
                    {rec.recording ? t('speaking.stopRec') : t('speaking.startRec')}
                  </Button>
                </>
              )}
            </Space>

            {rec.url && !rec.recording && (
              <div>
                <Typography.Text type="secondary">{t('speaking.myVoice')}</Typography.Text>
                <audio controls src={rec.url} style={{ display: 'block', width: '100%', marginTop: 6 }} />
              </div>
            )}

            {pron && (
              <Card size="small" title={t('speaking.scoreTitle', { n: pron.score })}>
                <Progress
                  percent={pron.score}
                  strokeColor={pron.score >= 80 ? '#3b8c5a' : pron.score >= 60 ? '#d98f2b' : '#d64550'}
                />
                <div style={{ marginTop: 10, fontSize: 17, lineHeight: 1.8 }}>
                  {pron.words.map((w, i) => (
                    <span
                      key={i}
                      style={{
                        marginRight: 8,
                        color: w.ok ? 'var(--green-ink)' : 'var(--red-pen)',
                        textDecoration: w.ok ? 'none' : 'underline',
                        fontWeight: w.ok ? 500 : 700,
                      }}
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
                <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                  {t('speaking.transcript')}：{pron.transcript || '—'}
                </Typography.Text>
                {pron.missing.length > 0 && (
                  <Typography.Text type="danger" style={{ display: 'block' }}>
                    {t('speaking.missing')}：{pron.missing.join(', ')}
                  </Typography.Text>
                )}
              </Card>
            )}

            <Row justify="space-between" style={{ marginTop: 8 }}>
              <Button
                disabled={lineIdx === 0}
                onClick={() => {
                  setLineIdx((i) => i - 1);
                  setPron(null);
                }}
              >
                {t('speaking.prev')}
              </Button>
              <Button
                type="primary"
                disabled={lineIdx >= scenario.lines.length - 1}
                onClick={() => {
                  setLineIdx((i) => i + 1);
                  setPron(null);
                }}
              >
                {t('speaking.next')}
              </Button>
            </Row>
          </Space>
        </Card>

        <Card size="small" title={t('speaking.history')}>
          <List
            size="small"
            dataSource={(records ?? []).slice(0, 8)}
            locale={{ emptyText: t('speaking.noRecords') }}
            renderItem={(r) => (
              <List.Item
                actions={[
                  r.has_audio ? (
                    <Button
                      key="play"
                      type="text"
                      icon={<PlayCircleOutlined />}
                      onClick={() => {
                        const a = new Audio(api.speakingAudioUrl(r.id));
                        void a.play();
                      }}
                    />
                  ) : null,
                  <Button
                    key="del"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => removeRec.mutate(r.id)}
                  />,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <b>{Math.round(r.score)}</b>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {r.study_date}
                      </Typography.Text>
                    </Space>
                  }
                  description={
                    <span style={{ fontSize: 12 }}>
                      {r.target_text.slice(0, 60)}
                      {r.transcript ? ` → ${r.transcript.slice(0, 40)}` : ''}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      </Space>
    );
  }

  // ---------- 场景列表 ----------
  return (
    <Space direction="vertical" style={{ width: '100%' }} size={14}>
      <Card size="small" style={{ background: '#fff' }}>
        <Row align="middle" justify="space-between" gutter={12} style={{ marginBottom: 8 }}>
          <Col flex="auto">
            <Space wrap align="center">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {t('speaking.title')}
              </Typography.Title>
              <Segmented
                value={mode}
                onChange={(v) => setMode(v as Mode)}
                options={[
                  { label: t('speaking.modeDialogue'), value: 'dialogue' },
                  { label: t('speaking.modeWords'), value: 'words' },
                ]}
              />
            </Space>
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              {t('speaking.subtitle')}
            </Typography.Text>
          </Col>
          <Col>
            <Select
              allowClear
              placeholder={t('speaking.filterScene')}
              style={{ width: 140 }}
              value={scene}
              onChange={setScene}
              options={[
                { value: 'airport', label: t('speaking.sceneAirport') },
                { value: 'restaurant', label: t('speaking.sceneRestaurant') },
                { value: 'hotel', label: t('speaking.sceneHotel') },
                { value: 'shopping', label: t('speaking.sceneShopping') },
                { value: 'clinic', label: t('speaking.sceneClinic') },
                { value: 'work', label: t('speaking.sceneWork') },
                { value: 'family', label: t('speaking.sceneFamily') },
                { value: 'school', label: t('speaking.sceneSchool') },
              ]}
            />
          </Col>
        </Row>
        {spStats && spStats.total > 0 && (
          <Typography.Text type="secondary" style={{ display: 'block' }}>
            {t('speaking.totalPractice', { n: spStats.total, s: spStats.avg_score })}
          </Typography.Text>
        )}
        {!speechRecognitionSupported() && (
          <Alert
            style={{ marginTop: 10 }}
            type="warning"
            showIcon
            message={t('speaking.asrUnsupported')}
          />
        )}
      </Card>

      <List
        loading={isLoading}
        grid={{ gutter: 12, xs: 1, sm: 2 }}
        locale={{ emptyText: <Empty description={t('speaking.empty')} /> }}
        dataSource={scenarios ?? []}
        renderItem={(s) => (
          <List.Item>
            <Card
              title={
                <Space>
                  <span>{SCENE_ICON[s.scene] ?? '💬'}</span>
                  {s.title}
                </Space>
              }
              actions={[
                <Button key="go" type="primary" onClick={() => openScenario(s.id)}>
                  {t('speaking.startPractice')}
                </Button>,
              ]}
            >
              <Typography.Paragraph type="secondary" style={{ minHeight: 44 }}>
                {s.description}
              </Typography.Paragraph>
              <Space>
                <Tag>{t(`common.level.${s.level}`)}</Tag>
                <Tag color="geekblue">{t('speaking.lineCount', { n: s.line_count })}</Tag>
              </Space>
            </Card>
          </List.Item>
        )}
      />
    </Space>
  );
}