/** 真题演练页：入门/四六级/考研 考试题型阅读训练，复用阅读理解作答链路。 */
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import LevelTag from '../components/LevelTag';

/** 级别筛选 Tab；i18nKey 供 t() 使用，空 key 表示「全部」。 */
const TABS: { key: string; i18nKey: string }[] = [
  { key: '', i18nKey: 'exam.tabAll' },
  { key: 'beginner', i18nKey: 'common.level.beginner' },
  { key: 'cet4', i18nKey: 'common.level.cet4' },
  { key: 'cet6', i18nKey: 'common.level.cet6' },
  { key: 'kaoyan', i18nKey: 'common.level.kaoyan' },
];

export default function Exam() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [level, setLevel] = useState<string | undefined>(undefined);
  const { data, isLoading } = useQuery({
    queryKey: ['exam-articles', level],
    queryFn: () => api.articles(level, 'exam'),
  });

  return (
    <Card
      title={t('exam.title')}
      extra={<Typography.Text type="secondary">{t('exam.subtitle')}</Typography.Text>}
      tabList={TABS.map((tb) => ({
        key: tb.key,
        tab: t(tb.i18nKey),
      }))}
      activeTabKey={level ?? ''}
      onTabChange={(k) => setLevel(k || undefined)}
    >
      <List
        loading={isLoading}
        locale={{ emptyText: <Empty description={t('exam.empty')} /> }}
        dataSource={data ?? []}
        renderItem={(a) => (
          <List.Item
            actions={[
              <Button key="go" type="link" onClick={() => navigate(`/reading/${a.id}`)}>
                {a.attempt_count > 0 ? t('reading.reread') : t('exam.start')}
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space wrap>
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {a.title}
                  </Typography.Text>
                  <LevelTag level={a.level} />
                  {a.exam_label && <Tag color="orange">{a.exam_label}</Tag>}
                </Space>
              }
              description={
                <Typography.Text type="secondary">
                  {a.attempt_count > 0
                    ? `${t('reading.words', { n: a.word_count })} · ${t('reading.practiced', {
                        n: a.attempt_count,
                        p: Math.round((a.best_score ?? 0) * 100),
                      })}`
                    : `${t('reading.words', { n: a.word_count })} · ${t('reading.never')}`}
                </Typography.Text>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}