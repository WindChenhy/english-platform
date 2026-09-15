/** 错题本页：未解决/已解决两个标签页，未解决的可就地重练。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, App, Button, Card, Empty, List, Radio, RadioChangeEvent, Space, Tag, Typography } from 'antd';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api';

interface Feedback {
  correct: boolean;
  answer: number;
  explanation: string;
}

export default function Mistakes() {
  const [tab, setTab] = useState('unresolved');
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery({
    queryKey: ['mistakes', tab],
    queryFn: () => api.mistakes(tab === 'resolved'),
  });

  const practice = useMutation({
    mutationFn: (p: { questionId: number; choice: number | null }) =>
      api.practice(p.questionId, p.choice),
    onSuccess: (r) => {
      if (r.correct) {
        message.success(t('mistakes.resolvedMsg'));
        queryClient.invalidateQueries({ queryKey: ['mistakes'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      }
    },
    onError: (e) => message.error((e as Error).message),
  });

  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [feedback, setFeedback] = useState<Record<number, Feedback | undefined>>({});

  return (
    <Card
      title={t('mistakes.title')}
      tabList={[
        { key: 'unresolved', tab: t('mistakes.unresolved') },
        { key: 'resolved', tab: t('mistakes.resolved') },
      ]}
      activeTabKey={tab}
      onTabChange={setTab}
    >
      <List
        loading={isLoading}
        locale={{ emptyText: <Empty description={t('mistakes.emptyOk')} /> }}
        dataSource={data ?? []}
        renderItem={(m) => {
          const fb = feedback[m.question.id];
          return (
            <List.Item style={{ display: 'block' }}>
              <Space style={{ marginBottom: 8 }}>
                <Tag color="blue">{m.article.title}</Tag>
                <Typography.Text type="secondary">{t('mistakes.collected', { date: m.created_at.slice(0, 10) })}</Typography.Text>
              </Space>
              <Typography.Paragraph strong>{m.question.question}</Typography.Paragraph>
              <Radio.Group
                disabled={!!fb || tab === 'resolved'}
                value={choices[m.question.id]}
                onChange={(e: RadioChangeEvent) =>
                  setChoices((s) => ({ ...s, [m.question.id]: e.target.value }))
                }
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                {m.question.options.map((opt, oi) => {
                  let radioStyle: CSSProperties = {};
                  if (fb) {
                    if (oi === fb.answer) radioStyle = { color: '#3b8c5a', fontWeight: 600 };
                    else if (oi === choices[m.question.id] && !fb.correct) radioStyle = { color: '#d64550' };
                  } else if (tab === 'resolved' && oi === m.question.answer) {
                    radioStyle = { color: '#3b8c5a' };
                  }
                  return (
                    <Radio key={oi} value={oi} style={radioStyle}>
                      {String.fromCharCode(65 + oi)}. {opt}
                    </Radio>
                  );
                })}
              </Radio.Group>
              {fb && (
                <Alert
                  style={{ marginTop: 8 }}
                  type={fb.correct ? 'success' : 'error'}
                  showIcon
                  message={
                    fb.correct
                      ? t('mistakes.resolvedMsg')
                      : t('mistakes.stillWrong', { ans: String.fromCharCode(65 + fb.answer) })
                  }
                  description={fb.explanation || undefined}
                />
              )}
              {tab === 'unresolved' && !fb && (
                <Button
                  type="primary"
                  style={{ marginTop: 12 }}
                  disabled={choices[m.question.id] == null}
                  loading={practice.isPending}
                  onClick={() => {
                    practice.mutate(
                      { questionId: m.question.id, choice: choices[m.question.id] ?? null },
                      {
                        onSuccess: (r) =>
                          setFeedback((s) => ({
                            ...s,
                            [m.question.id]: {
                              correct: r.correct,
                              answer: r.answer,
                              explanation: r.explanation,
                            },
                          })),
                      },
                    );
                  }}
                >
                  {t('mistakes.submitPractice')}
                </Button>
              )}
            </List.Item>
          );
        }}
      />
    </Card>
  );
}
