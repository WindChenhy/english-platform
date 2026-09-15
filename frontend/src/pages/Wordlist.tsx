/** 生词本页：全部收藏的生词卡片，可发音、可删除。 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DeleteOutlined, SoundOutlined } from '@ant-design/icons';
import { App, Button, Card, Popconfirm, Table } from 'antd';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api, WordlistCard } from '../api';
import { speak } from '../speech';

export default function Wordlist() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['wordlist'], queryFn: api.wordlist });

  const remove = useMutation({
    mutationFn: (word: string) => api.removeWordlist(word),
    onSuccess: () => {
      message.success(t('wordlist.deleted'));
      queryClient.invalidateQueries({ queryKey: ['wordlist'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
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
    { title: t('wordlist.colInterval'), dataIndex: 'interval', width: 110, align: 'center' as const },
    { title: t('wordlist.colDue'), dataIndex: 'due', width: 110 },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: unknown, row: WordlistCard) => (
        <Popconfirm
          title={t('wordlist.popTitle')}
          description={t('wordlist.popDesc')}
          onConfirm={() => remove.mutate(row.word)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  return (
    <Card
      title={t('wordlist.title')}
      extra={
        <Button type="primary" onClick={() => navigate('/study')}>
          {t('wordlist.goReview')}
        </Button>
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
