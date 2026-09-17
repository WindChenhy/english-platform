/** 生词本页：搜索排序、发音、挂起/删除；桌面表格 / 小屏卡片列表。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined, PauseCircleOutlined, SoundOutlined } from '@ant-design/icons';
import { App, Button, Card, Input, Popconfirm, Select, Space, Table, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, WordlistCard } from '../api';
import { isMobileViewport } from '../env';
import { speak } from '../speech';

function StateTag({ s }: { s?: string }) {
  return s && s !== 'new' ? <Tag>{s}</Tag> : <Tag color="blue">new</Tag>;
}

export default function Wordlist() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('created');
  const [mobile, setMobile] = useState(() => isMobileViewport());
  const { data, isLoading } = useQuery({
    queryKey: ['wordlist', q, sort],
    queryFn: () => api.wordlist(q || undefined, sort),
  });

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

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
      width: 140,
      render: (w: string) => (
        <Button type="text" icon={<SoundOutlined />} onClick={() => speak(w)} style={{ padding: 0 }}>
          <span className="cell-nowrap">{w}</span>
        </Button>
      ),
    },
    { title: t('wordlist.colMeaning'), dataIndex: 'meaning', ellipsis: true },
    {
      title: t('wordlist.colPhonetic'),
      dataIndex: 'phonetic',
      width: 140,
      render: (p?: string | null) => (
        <span className="cell-nowrap phonetic-cell">{p ? `/${p}/` : '-'}</span>
      ),
    },
    {
      title: t('wordlist.colState'),
      dataIndex: 'state',
      width: 90,
      render: (s?: string) => <StateTag s={s} />,
    },
    {
      title: t('wordlist.colLapses'),
      dataIndex: 'lapses',
      width: 80,
      align: 'center' as const,
      render: (n?: number) => n ?? 0,
    },
    { title: t('wordlist.colInterval'), dataIndex: 'interval', width: 100, align: 'center' as const },
    {
      title: t('wordlist.colDue'),
      dataIndex: 'due',
      width: 120,
      render: (d: string) => <span className="cell-nowrap">{d}</span>,
    },
    {
      title: '',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
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

  const toolbar = (
    <div className="wordlist-toolbar">
      <Input.Search
        allowClear
        placeholder={t('wordlist.searchPh')}
        onSearch={(v) => setQ(v)}
        className="wordlist-search"
      />
      <Select
        value={sort}
        onChange={setSort}
        className="wordlist-sort"
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
    </div>
  );

  return (
    <Card title={t('wordlist.title')} extra={mobile ? undefined : toolbar} className="wordlist-card">
      {mobile && toolbar}

      {mobile ? (
        <div className="wordlist-mobile">
          {(data ?? []).map((row) => (
            <div key={row.id} className="wordlist-item">
              <div className="wordlist-item-main">
                <div className="wordlist-item-word">
                  <Button type="text" icon={<SoundOutlined />} onClick={() => speak(row.word)}>
                    {row.word}
                  </Button>
                  <StateTag s={row.state} />
                </div>
                <div className="wordlist-item-meaning">{row.meaning}</div>
                <div className="wordlist-item-meta">
                  {row.phonetic ? <span className="phonetic-cell">/{row.phonetic}/</span> : null}
                  <span>
                    {t('wordlist.colInterval')} {row.interval}
                  </span>
                  <span>
                    {t('wordlist.colLapses')} {row.lapses ?? 0}
                  </span>
                  <span className="cell-nowrap">{row.due}</span>
                </div>
              </div>
              <div className="wordlist-item-actions">
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
              </div>
            </div>
          ))}
          {!isLoading && (data?.length ?? 0) === 0 && (
            <div className="wordlist-empty">{t('wordlist.empty')}</div>
          )}
          <div className="wordlist-mobile-total">{t('wordlist.total', { n: data?.length ?? 0 })}</div>
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data ?? []}
          columns={columns}
          scroll={{ x: 960 }}
          pagination={{ pageSize: 20, showTotal: (n) => t('wordlist.total', { n }) }}
          locale={{ emptyText: t('wordlist.empty') }}
          className="wordlist-table"
        />
      )}
    </Card>
  );
}
