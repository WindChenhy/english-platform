/** 阅读详情页：衬线正文点词查词、收藏生词、理解题作答与判分反馈。 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { SoundOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Drawer,
  Radio,
  RadioChangeEvent,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { api, Level, SubmitResp } from '../api';
import { speak } from '../speech';

const LEVEL_COLOR: Record<string, string> = { beginner: '#3b8c5a', cet4: '#2b4c7e', cet6: '#6b4fa0' };

export default function ReadingArticle() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const articleId = Number(id);

  const { data, isLoading } = useQuery({
    queryKey: ['article', articleId],
    queryFn: () => api.article(articleId),
  });

  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [result, setResult] = useState<SubmitResp | null>(null);
  const [word, setWord] = useState<string | null>(null);

  // 点词查词：word 非空时才发起请求
  const dictQuery = useQuery({
    queryKey: ['dict', word],
    queryFn: () => api.dict(word!),
    enabled: !!word,
  });

  const addWord = useMutation({
    mutationFn: (w: string) => api.addWordlist(w),
    onSuccess: (r) => {
      message.success(r.created ? t('reading.added') : t('reading.already'));
    },
    onError: (e) => message.error((e as Error).message),
  });

  if (isLoading || !data) return <Card loading style={{ minHeight: 400 }} />;

  const attemptsNote = data.attempts.length > 0
    ? t('reading.attemptsDone', { n: data.attempts.length })
    : t('reading.firstRead');

  /** 提交全部理解题：后端判分并自动登记错题。 */
  async function submit() {
    try {
      const answers = data!.questions.map((q) => ({ question_id: q.id, choice: choices[q.id] ?? null }));
      const r = await api.submitArticle(data!.id, answers);
      setResult(r);
      message.success(`${r.correct} / ${r.total}`);
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  /** 把正文按单词切分并包上可点击的 token，用于点词查词。 */
  function tokenize(text: string) {
    const tokens = text.split(/([A-Za-z']+)/);
    return tokens.map((tk, i) =>
      /^[A-Za-z']+$/.test(tk) ? (
        <span key={i} className="word-token" onClick={() => setWord(tk)}>
          {tk}
        </span>
      ) : (
        tk
      ),
    );
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <Typography.Text strong>{data.title}</Typography.Text>
            <Tag style={{ color: LEVEL_COLOR[data.level], borderColor: LEVEL_COLOR[data.level], background: '#fff' }}>
              {t(`common.level.${data.level}`)}
            </Tag>
          </Space>
        }
        extra={
          <Typography.Text type="secondary">
            {t('reading.extra', { n: data.word_count, s: attemptsNote })}
          </Typography.Text>
        }
      >
        {data.content.split('\n\n').map((para, i) => (
          <Typography.Paragraph key={i} className="article-para">
            {tokenize(para)}
          </Typography.Paragraph>
        ))}
      </Card>

      <Card title={t('reading.quizTitle')} style={{ marginTop: 16 }}>
        {data.questions.map((q, qi) => {
          const r = result?.results.find((x) => x.question_id === q.id);
          return (
            <div key={q.id} style={{ marginBottom: 28 }}>
              <Typography.Paragraph strong>{qi + 1}. {q.question}</Typography.Paragraph>
              <Radio.Group
                disabled={!!result}
                value={choices[q.id]}
                onChange={(e: RadioChangeEvent) =>
                  setChoices((s) => ({ ...s, [q.id]: e.target.value }))
                }
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                {q.options.map((opt, oi) => {
                  let radioStyle: CSSProperties = {};
                  if (r) {
                    if (oi === r.answer) radioStyle = { color: '#3b8c5a', fontWeight: 600 };
                    else if (oi === r.choice && !r.correct) radioStyle = { color: '#d64550' };
                  }
                  return (
                    <Radio key={oi} value={oi} style={radioStyle}>
                      {String.fromCharCode(65 + oi)}. {opt}
                    </Radio>
                  );
                })}
              </Radio.Group>
              {r && (
                <Alert
                  style={{ marginTop: 8 }}
                  type={r.correct ? 'success' : 'error'}
                  showIcon
                  message={r.correct ? t('reading.qCorrect') : t('reading.qWrong', { ans: String.fromCharCode(65 + r.answer) })}
                  description={r.explanation || undefined}
                />
              )}
            </div>
          );
        })}
        {!result ? (
          <Button type="primary" size="large" onClick={submit}>
            {t('reading.submit')}
          </Button>
        ) : (
          <Space>
            <Button
              onClick={() => {
                setResult(null);
                setChoices({});
              }}
            >
              {t('reading.retake')}
            </Button>
            <Button onClick={() => navigate('/reading')}>{t('reading.backToList')}</Button>
          </Space>
        )}
      </Card>

      <Drawer title={t('reading.lookup', { word: word ?? '' })} open={!!word} onClose={() => setWord(null)} width={380}>
        {dictQuery.isLoading && <Spin />}
        {dictQuery.isError && (
          // 404 表示词典无此词，其余情况展示原始错误信息
          <Typography.Text type="danger">
            {String((dictQuery.error as Error).message).includes('没有')
              ? t('reading.notFound', { word })
              : `${t('reading.lookupFailed')}: ${(dictQuery.error as Error).message}`}
          </Typography.Text>
        )}
        {dictQuery.data && (
          <div>
            <Space align="center">
              <Typography.Title level={4} style={{ margin: 0 }}>
                {dictQuery.data.word}
              </Typography.Title>
              <Button type="text" icon={<SoundOutlined />} onClick={() => speak(dictQuery.data!.word)} />
            </Space>
            {dictQuery.data.phonetic && (
              <Typography.Paragraph type="secondary">/ {dictQuery.data.phonetic} /</Typography.Paragraph>
            )}
            <Typography.Paragraph style={{ fontSize: 15 }}>
              {dictQuery.data.translation || '—'}
            </Typography.Paragraph>
            {dictQuery.data.definition && (
              <Typography.Paragraph type="secondary">{dictQuery.data.definition}</Typography.Paragraph>
            )}
            {dictQuery.data.tag && (
              <Tag color="geekblue">{dictQuery.data.tag.split(' ').slice(0, 4).join(' ')}</Tag>
            )}
            <div style={{ marginTop: 16 }}>
              <Button type="primary" loading={addWord.isPending} onClick={() => addWord.mutate(word!)}>
                {t('reading.addWordlist')}
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
