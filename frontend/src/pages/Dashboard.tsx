/** 首页仪表盘：问候语 + 统计盒 + 每日目标进度 + 背单词/阅读双卡片 + 图表入口 + 备份导入/导出。 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChartOutlined,
  BookOutlined,
  ExportOutlined,
  ImportOutlined,
  ReadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  InputNumber,
  Modal,
  Progress,
  Row,
  Space,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

/** 单个统计盒：衬线大数字 + 顶边分类色（alert=红笔提醒，warm=荧光黄）。 */
function StatBox(props: {
  label: string;
  value: number | string;
  unit?: string;
  tone?: 'default' | 'alert' | 'warm';
}) {
  return (
    <div className={`stat-box${props.tone === 'alert' ? ' alert' : props.tone === 'warm' ? ' warm' : ''}`}>
      <div className="stat-label">{props.label}</div>
      <div className="stat-num">
        {props.value}
        {props.unit && <span className="stat-unit">{props.unit}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: stats, isLoading } = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  const [goalOpen, setGoalOpen] = useState(false);
  const [draftNew, setDraftNew] = useState(10);
  const [draftReview, setDraftReview] = useState(60);

  function openGoals() {
    setDraftNew(stats?.goals?.daily_new ?? 10);
    setDraftReview(stats?.goals?.daily_review ?? 60);
    setGoalOpen(true);
  }

  async function saveGoals() {
    try {
      await api.saveGoals({ daily_new: draftNew, daily_review: draftReview });
      message.success(t('dash.goalsSaved'));
      setGoalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    } catch (e) {
      message.error((e as Error).message);
    }
  }

  /** 读取备份文件 → 确认覆盖 → 提交 /api/import → 刷新全部缓存。 */
  function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(reader.result));
      } catch {
        message.error(t('dash.importFileError'));
        return;
      }
      modal.confirm({
        title: t('dash.importTitle'),
        content: t('dash.importConfirm'),
        okText: t('common.confirm'),
        cancelText: t('common.cancel'),
        onOk: async () => {
          try {
            const r = await api.importData(payload);
            message.success(t('dash.importDone', { cards: r.cards, logs: r.review_logs }));
            queryClient.invalidateQueries();
          } catch (err) {
            message.error(t('common.requestFailed', { msg: (err as Error).message }));
          }
        },
      });
    };
    reader.readAsText(file);
  }

  if (isLoading || !stats) return <Card loading style={{ minHeight: 300 }} />;

  const studied = stats.new_today + stats.review_today;
  const greeting = stats.due_today > 0
    ? t('dash.greetDue', { n: stats.due_today })
    : studied > 0
      ? t('dash.greetDone')
      : t('dash.greetIdle');

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          margin: '2px 0 20px',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div className="greet-date">{dayjs().format(t('dash.dateFmt'))}</div>
          <div className="greet-line">{greeting}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="hand" style={{ color: 'var(--green-ink)', fontSize: 15 }}>
            {stats.streak_days > 0
              ? t('dash.streakChip', { n: stats.streak_days })
              : t('dash.noStreak')}
          </span>
          <button
            className="export-chip"
            onClick={() => navigate('/stats')}
            title={t('nav.charts')}
          >
            <BarChartOutlined />
            {t('dash.viewCharts')}
          </button>
          <button
            className="export-chip"
            onClick={() => window.open('/api/export')}
            title={t('dash.exportTitle')}
          >
            <ExportOutlined />
            {t('dash.exportChip')}
          </button>
          <button className="export-chip" onClick={() => fileRef.current?.click()}>
            <ImportOutlined />
            {t('dash.importChip')}
          </button>
          <button className="export-chip" onClick={openGoals} title={t('dash.goalsTitle')}>
            <SettingOutlined />
            {t('dash.goalsChip')}
          </button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={onImportFile} />
        </div>
      </div>

      <Card size="small" style={{ marginBottom: 14, background: '#fff' }}>
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Typography.Text strong>{t('dash.goalsTitle')}</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Space size="large" wrap>
                <span>
                  <Typography.Text type="secondary">{t('dash.goalNew')} </Typography.Text>
                  <b>
                    {stats.new_today}/{stats.goals?.daily_new ?? 0}
                  </b>
                  <Progress
                    percent={Math.min(100, Math.round((stats.new_today / Math.max(stats.goals?.daily_new || 1, 1)) * 100))}
                    showInfo={false}
                    size="small"
                    style={{ width: 120, display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }}
                  />
                </span>
                <span>
                  <Typography.Text type="secondary">{t('dash.goalReview')} </Typography.Text>
                  <b>
                    {stats.review_today}/{stats.goals?.daily_review ?? 0}
                  </b>
                  <Progress
                    percent={Math.min(
                      100,
                      Math.round((stats.review_today / Math.max(stats.goals?.daily_review || 1, 1)) * 100),
                    )}
                    showInfo={false}
                    size="small"
                    style={{ width: 120, display: 'inline-block', marginLeft: 8, verticalAlign: 'middle' }}
                  />
                </span>
                <Typography.Text type="secondary">
                  {t('dash.extraToday', { d: stats.dictation_today, b: stats.battle_today })}
                </Typography.Text>
              </Space>
            </div>
          </Col>
        </Row>
      </Card>

      <Modal
        open={goalOpen}
        title={t('dash.goalsTitle')}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onOk={saveGoals}
        onCancel={() => setGoalOpen(false)}
      >
        <Space direction="vertical" size={12} style={{ width: '100%', marginTop: 8 }}>
          <div>
            <Typography.Text type="secondary">{t('dash.goalNew')}</Typography.Text>
            <InputNumber
              min={0}
              max={200}
              value={draftNew}
              onChange={(v) => setDraftNew(v ?? 10)}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <Typography.Text type="secondary">{t('dash.goalReview')}</Typography.Text>
            <InputNumber
              min={0}
              max={500}
              value={draftReview}
              onChange={(v) => setDraftReview(v ?? 60)}
              style={{ width: '100%' }}
            />
          </div>
        </Space>
      </Modal>

      <Row gutter={[14, 14]}>
        <Col xs={12} sm={8} md={4} flex="1">
          <StatBox label={t('dash.statNew')} value={stats.new_today} unit={t('dash.unitWord')} />
        </Col>
        <Col xs={12} sm={8} md={4} flex="1">
          <StatBox label={t('dash.statReview')} value={stats.review_today} unit={t('dash.unitCard')} />
        </Col>
        <Col xs={12} sm={8} md={4} flex="1">
          <StatBox
            label={t('dash.statDue')}
            value={stats.due_today}
            unit={t('dash.unitCard')}
            tone={stats.due_today > 0 ? 'alert' : 'default'}
          />
        </Col>
        <Col xs={12} sm={8} md={4} flex="1">
          <StatBox label={t('dash.statStreak')} value={stats.streak_days} unit={t('dash.unitDay')} tone="warm" />
        </Col>
        <Col xs={12} sm={8} md={4} flex="1">
          <StatBox label={t('dash.statVocab')} value={stats.vocab_estimate} unit={t('dash.unitWord')} />
        </Col>
        <Col xs={12} sm={8} md={4} flex="1">
          <StatBox label={t('dash.statWordlist')} value={stats.wordlist_count} unit={t('dash.unitWord')} />
        </Col>
      </Row>

      <Row gutter={[14, 14]} style={{ marginTop: 14 }}>
        <Col xs={24} md={12}>
          <Card
            title={<span><BookOutlined /> {t('dash.studyTitle')}</span>}
            styles={{ body: { paddingBottom: 18 } }}
            actions={[
              <Button key="go" type="primary" onClick={() => navigate('/study')}>
                {t('dash.startStudy')}
              </Button>,
              <Button key="dictation" onClick={() => navigate('/dictation')}>
                {t('dash.goDictation')}
              </Button>,
              <Button key="battle" onClick={() => navigate('/battle')}>
                {t('dash.goBattle')}
              </Button>,
            ]}
          >
            {stats.due_today > 0 ? (
              <Typography.Text>
                <Typography.Text strong style={{ color: 'var(--red-pen)' }}>{stats.due_today}</Typography.Text>{' '}
                {t('dash.dueInfo')}
              </Typography.Text>
            ) : (
              <Typography.Text type="secondary">{t('dash.noDue')}</Typography.Text>
            )}
            <div style={{ marginTop: 10 }}>
              <Typography.Text type="secondary">
                {t('dash.studiedToday', { n: stats.new_today, m: stats.review_today })}
              </Typography.Text>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            title={<span><ReadOutlined /> {t('dash.readingTitle')}</span>}
            styles={{ body: { paddingBottom: 18 } }}
            actions={[
              <Button key="go" type="primary" onClick={() => navigate('/reading')}>
                {t('dash.goReading')}
              </Button>,
            ]}
          >
            <Progress
              percent={Math.round(
                (stats.reading.articles_done / Math.max(stats.reading.articles_total, 1)) * 100,
              )}
              format={() => t('dash.readingOf', { done: stats.reading.articles_done, total: stats.reading.articles_total })}
            />
            <Typography.Text type="secondary">
              {stats.reading.attempt_count > 0
                ? t('dash.readingAcc', {
                    n: stats.reading.attempt_count,
                    p: (stats.reading.accuracy! * 100).toFixed(0),
                  })
                : t('dash.readingNone')}
            </Typography.Text>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
