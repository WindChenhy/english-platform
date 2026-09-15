/** 全局导航与页头：wordmark、多语言主导航菜单、语言切换器、连续打卡徽章。 */
import {
  BarChartOutlined,
  BookOutlined,
  DashboardOutlined,
  EditOutlined,
  HighlightOutlined,
  ReadOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Layout, Menu, Segmented } from 'antd';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';

/** 页头右侧的连续打卡徽章（手写体芯片，复用全局 stats 缓存）。 */
function StreakChip() {
  const { t } = useTranslation();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  if (!stats) return null;
  return (
    <span className="streak-chip">
      {stats.streak_days > 0 ? t('dash.streakChip', { n: stats.streak_days }) : t('dash.noStreak')}
    </span>
  );
}

/** 页头语言切换器：中 / EN，切换即持久化（i18next 语言探测器写入 localStorage）。 */
function LangSwitch() {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('zh') ? 'zh' : 'en';
  return (
    <Segmented
      size="small"
      value={current}
      onChange={(v) => i18n.changeLanguage(v as string)}
      options={[
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'EN' },
      ]}
    />
  );
}

/** 布局组件：白色纸面页头 + 居中内容区，通过 Outlet 渲染子路由。 */
export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const selected = '/' + (location.pathname.split('/')[1] ?? '');

  // 浏览器标签页标题跟随语言
  useEffect(() => {
    document.title = t('app.title');
  }, [t, i18n.language]);

  const items = [
    { key: '/', icon: <DashboardOutlined />, label: t('nav.home') },
    { key: '/study', icon: <BookOutlined />, label: t('nav.study') },
    { key: '/dictation', icon: <HighlightOutlined />, label: t('nav.dictation') },
    { key: '/battle', icon: <ThunderboltOutlined />, label: t('nav.battle') },
    { key: '/stats', icon: <BarChartOutlined />, label: t('nav.charts') },
    { key: '/reading', icon: <ReadOutlined />, label: t('nav.reading') },
    { key: '/wordlist', icon: <StarOutlined />, label: t('nav.wordlist') },
    { key: '/mistakes', icon: <EditOutlined />, label: t('nav.mistakes') },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: 'transparent' }}>
      <Layout.Header
        className="app-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#fff',
          borderBottom: '2px solid var(--ink)',
          padding: '0 28px',
          height: 60,
          lineHeight: 'normal',
        }}
      >
        <div
          onClick={() => navigate('/')}
          style={{ marginRight: 28, cursor: 'pointer', lineHeight: 1.1 }}
        >
          <div className="wordmark">词迹</div>
          <div className="wordmark-sub">word traces</div>
        </div>
        <Menu
          theme="light"
          mode="horizontal"
          selectedKeys={[selected]}
          items={items}
          onClick={(e) => navigate(e.key)}
          style={{ flex: 1, minWidth: 0 }}
        />
        <LangSwitch />
        <div style={{ width: 14 }} />
        <StreakChip />
      </Layout.Header>
      <Layout.Content style={{ padding: '26px 24px 40px', maxWidth: 920, margin: '0 auto', width: '100%' }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
