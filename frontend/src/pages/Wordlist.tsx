/** 生词本页：搜索排序、发音、挂起/删除；卡片状态可预览。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined, PauseCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { App, Button, Card, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, WordlistCard } from '../api';
import { speak } from '../speech';

export default function Wordlist() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('created');
  const { data, isLoading } = useQuery({
    queryKey: ['wordlist', q, sort],
    queryFn: () => api.wordlist(q || undefined, sort),
  });

  const remove = useMutation({
    mutationFn: (word: string) => api.removeWordlist(word),
    onSuccess: () => {
      message.success(t('wordlist.deleted'));
      queryClient.invalidateQueries({ queryKey: ['wordlist'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e) => message.error((e as Error).message),
  });

  const suspend = useMutation({
    mutationFn: (word: string) => api.suspendCard(word, 7),
    onSuccess: (_r, word) => {
      message.success(t('study.suspended', { w: word }));
      queryClient.invalidateQueries({ queryKey: ['wordlist'] });
    },
    onError: (e) => message.error((e as Error).message),
  });

  const columns = [
    {
      title: t('wordlist.colWord'),
      dataIndex: 'word',
      render: (w: string) => (
        <Button type="text" icon={<SoundOutlined />} onClick={() => speak(w)} style={{ padding: 0 }}>
          {w}
        </Button>
      ),
    },
    { title: t('wordlist.colMeaning'), dataIndex: 'meaning', ellipsis: true },
    { title: t('wordlist.colPhonetic'), dataIndex: 'phonetic', render: (p?: string | null) => (p ? `/ ${p} /` : '-') },
    {
      title: t('wordlist.colState'),
      dataIndex: 'state',
      width: 100,
      render: (s?: string) => (s && s !== 'new' ? <Tag>{s}</Tag> : <Tag color="blue">new</Tag>),
    },
    {
      title: t('wordlist.colLapses'),
      dataIndex: 'lapses',
      width: 80,
      align: 'center' as const,
      render: (n?: number) => n ?? 0,
    },
    { title: t('wordlist.colInterval'), dataIndex: 'interval', width: 110, align: 'center' as const },
    { title: t('wordlist.colDue'), dataIndex: 'due', width: 110 },
    {
      title: '',
      key: 'action',
      width: 120,
      render: (_: unknown, row: WordlistCard) => (
        <Space size={0}>
          <Button
            type="text"
            icon={<PauseCircleOutlined />}
            title={t('study.suspend')}
            onClick={() => suspend.mutate(row.word)}
          />
          <Popconfirm
            title={t('wordlist.popTitle')}
            description={t('wordlist.popDesc')}
            onConfirm={() => remove.mutate(row.word)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={t('wordlist.title')}
      extra={
        <Space wrap>
          <Input.Search
            allowClear
            placeholder={t('wordlist.searchPh')}
            onSearch={(v) => setQ(v)}
            style={{ width: 200 }}
          />
          <Select
            value={sort}
            onChange={setSort}
            style={{ width: 140 }}
            options={[
              { value: 'created', label: t('wordlist.sortCreated') },
              { value: 'due', label: t('wordlist.sortDue') },
              { value: 'interval', label: t('wordlist.sortInterval') },
              { value: 'lapses', label: t('wordlist.sortLapses') },
              { value: 'word', label: t('wordlist.sortWord') },
            ]}
          />
          <Button type="primary" onClick={() => navigate('/study')}>
            {t('wordlist.goReview')}
          </Button>
        </Space>
      }
    >
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data ?? []}
        columns={columns}
        pagination={{ pageSize: 20, showTotal: (n) => t('wordlist.total', { n }) }}
        locale={{ emptyText: t('wordlist.empty') }}
      />
    </Card>
  );
}
