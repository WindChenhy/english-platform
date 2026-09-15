/** 阅读列表页：分级文章 + 用户自贴材料。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App, Button, Card, Empty, Input, List, Modal, Popconfirm, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import LevelTag from '../components/LevelTag';

export default function Reading() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const [level, setLevel] = useState<string | undefined>(undefined);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['articles', level],
    queryFn: () => api.articles(level),
  });
  const { data: userArts } = useQuery({
    queryKey: ['user-articles'],
    queryFn: api.userArticles,
  });

  const createArt = useMutation({
    mutationFn: () => api.createUserArticle(title.trim() || t('reading.untitled'), content),
    onSuccess: (r) => {
      message.success(t('reading.pasteSaved', { n: r.word_count }));
      setPasteOpen(false);
      setTitle('');
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['user-articles'] });
    },
    onError: (e) => message.error((e as Error).message),
  });

  const removeArt = useMutation({
    mutationFn: (id: number) => api.deleteUserArticle(id),
    onSuccess: () => {
      message.success(t('reading.pasteDeleted'));
      queryClient.invalidateQueries({ queryKey: ['user-articles'] });
    },
    onError: (e) => message.error((e as Error).message),
  });

  const tabs = [
    { key: '', label: t('reading.tabAll') },
    { key: 'beginner', label: t('common.level.beginner') },
    { key: 'cet4', label: t('common.level.cet4') },
    { key: 'cet6', label: t('common.level.cet6') },
    { key: 'kaoyan', label: t('common.level.kaoyan') },
    { key: 'mine', label: t('reading.tabMine') },
  ];

  if (level === 'mine') {
    return (
      <Card
        title={t('reading.title')}
        tabList={tabs.map((tb) => ({ key: tb.key, tab: tb.label }))}
        activeTabKey="mine"
        onTabChange={(k) => setLevel(k || undefined)}
        extra={
          <Button type="primary" onClick={() => setPasteOpen(true)}>
            {t('reading.pasteBtn')}
          </Button>
        }
      >
        <List
          locale={{ emptyText: <Empty description={t('reading.mineEmpty')} /> }}
          dataSource={userArts ?? []}
          renderItem={(a) => (
            <List.Item
              actions={[
                <Button key="go" type="link" onClick={() => navigate(`/reading/user/${a.id}`)}>
                  {t('reading.start')}
                </Button>,
                <Popconfirm
                  key="del"
                  title={t('reading.pasteDelTitle')}
                  onConfirm={() => removeArt.mutate(a.id)}
                >
                  <Button type="link" danger>
                    {t('reading.pasteDel')}
                  </Button>
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={a.title}
                description={t('reading.words', { n: a.word_count }) + ' · ' + a.created_at.slice(0, 10)}
              />
            </List.Item>
          )}
        />
        <Modal
          open={pasteOpen}
          title={t('reading.pasteTitle')}
          okText={t('common.confirm')}
          cancelText={t('common.cancel')}
          onOk={() => {
            if (content.trim().length < 10) {
              message.warning(t('reading.pasteTooShort'));
              return;
            }
            createArt.mutate();
          }}
          onCancel={() => setPasteOpen(false)}
          confirmLoading={createArt.isPending}
        >
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            <Input
              placeholder={t('reading.pastePhTitle')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
            <Input.TextArea
              rows={8}
              placeholder={t('reading.pastePhContent')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={20000}
            />
          </Space>
        </Modal>
      </Card>
    );
  }

  return (
    <Card
      title={t('reading.title')}
      tabList={tabs.map((tb) => ({ key: tb.key, tab: tb.label }))}
      activeTabKey={level ?? ''}
      onTabChange={(k) => setLevel(k || undefined)}
      extra={
        <Button onClick={() => setLevel('mine')}>{t('reading.tabMine')}</Button>
      }
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
