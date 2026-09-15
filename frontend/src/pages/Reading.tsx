/** 阅读列表页：按难度分级筛选文章，显示词数与练习成绩。 */
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Empty, List, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, Level } from '../api';

const LEVEL_COLOR: Record<string, string> = { beginner: '#3b8c5a', cet4: '#2b4c7e', cet6: '#6b4fa0' };

/** 难度标签（墨色系描边风格，与全站纸墨设计一致）。 */
function LevelTag({ level }: { level: Level }) {
  const { t } = useTranslation();
  const c = LEVEL_COLOR[level];
  return (
    <Tag style={{ color: c, borderColor: c, background: '#fff' }}>{t(`common.level.${level}`)}</Tag>
  );
}

export default function Reading() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [level, setLevel] = useState<string | undefined>(undefined);
  const { data, isLoading } = useQuery({
    queryKey: ['articles', level],
    queryFn: () => api.articles(level),
  });

  const tabs = [
    { key: '', label: t('reading.tabAll') },
    { key: 'beginner', label: t('common.level.beginner') },
    { key: 'cet4', label: t('common.level.cet4') },
    { key: 'cet6', label: t('common.level.cet6') },
  ];

  return (
    <Card
      title={t('reading.title')}
      tabList={tabs.map((tb) => ({ key: tb.key, tab: tb.label }))}
      activeTabKey={level ?? ''}
      onTabChange={(k) => setLevel(k || undefined)}
    >
      <List
        loading={isLoading}
        locale={{ emptyText: <Empty description={t('reading.empty')} /> }}
        dataSource={data ?? []}
        renderItem={(a) => (
          <List.Item
            actions={[
              <Button key="go" type="link" onClick={() => navigate(`/reading/${a.id}`)}>
                {a.attempt_count > 0 ? t('reading.reread') : t('reading.start')}
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {a.title}
                  </Typography.Text>
                  <LevelTag level={a.level} />
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
