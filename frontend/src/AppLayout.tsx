/** 全局导航与页头：桌面横向菜单；小屏顶栏精简 + 底部 Tab。 */
import {
  AudioOutlined,
  AppstoreOutlined,
  BarChartOutlined,
  BookOutlined,
  DashboardOutlined,
  EditOutlined,
  ExperimentOutlined,
  HighlightOutlined,
  ReadOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Drawer, Input, Layout, Menu, Segmented, Space, Typography } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { apiBase, isMobileViewport, isNativeShell, setApiBase } from './env';

/** 页头右侧的连续打卡徽章。 */
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

/** 原生壳（Tauri/Capacitor）可配置后端地址，手机连电脑局域网时用。 */
function ApiBaseEditor() {
  const { t } = useTranslation();
  const [value, setValue] = useState(() => apiBase());
  if (!isNativeShell()) return null;
  return (
    <div className="api-base-editor">
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {t('nav.apiBase', { defaultValue: '后端地址' })}
      </Typography.Text>
      <Space.Compact style={{ width: '100%', marginTop: 6 }}>
        <Input
          size="small"
          value={value}
          placeholder="http://192.168.x.x:8000"
          onChange={(e) => setValue(e.target.value)}
          onPressEnter={() => {
            setApiBase(value);
            window.location.reload();
          }}
        />
        <button
          type="button"
          className="api-base-save"
          onClick={() => {
            setApiBase(value);
            window.location.reload();
          }}
        >
          OK
        </button>
      </Space.Compact>
    </div>
  );
}

type NavItem = { key: string; icon: ReactNode; label: string };

function useNavItems(): NavItem[] {
  const { t } = useTranslation();
  return [
    { key: '/', icon: <DashboardOutlined />, label: t('nav.home') },
    { key: '/study', icon: <BookOutlined />, label: t('nav.study') },
    { key: '/dictation', icon: <HighlightOutlined />, label: t('nav.dictation') },
    { key: '/exam', icon: <ExperimentOutlined />, label: t('nav.exam') },
    { key: '/speaking', icon: <AudioOutlined />, label: t('nav.speaking') },
    { key: '/battle', icon: <ThunderboltOutlined />, label: t('nav.battle') },
    { key: '/stats', icon: <BarChartOutlined />, label: t('nav.charts') },
    { key: '/reading', icon: <ReadOutlined />, label: t('nav.reading') },
    { key: '/wordlist', icon: <StarOutlined />, label: t('nav.wordlist') },
    { key: '/mistakes', icon: <EditOutlined />, label: t('nav.mistakes') },
  ];
}

/** 小屏底部 4 个主入口 +「更多」抽屉。 */
const PRIMARY_TABS = ['/', '/study', '/dictation', '/speaking'] as const;

function MobileBottomNav({
  items,
  selected,
  onNav,
  onMore,
}: {
  items: NavItem[];
  selected: string;
  onNav: (key: string) => void;
  onMore: () => void;
}) {
  const primary = items.filter((i) => (PRIMARY_TABS as readonly string[]).includes(i.key));
  const moreActive = !PRIMARY_TABS.includes(selected as (typeof PRIMARY_TABS)[number]);
  const moreLabel = items.find((i) => i.key === '/exam')?.label ? '更多' : 'More';
  return (
    <nav className="mobile-tabbar" aria-label="main">
      {primary.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`mobile-tab${selected === item.key ? ' is-active' : ''}`}
          onClick={() => onNav(item.key)}
        >
          <span className="mobile-tab-icon">{item.icon}</span>
          <span className="mobile-tab-label">{item.label}</span>
        </button>
      ))}
      <button
        type="button"
        className={`mobile-tab${moreActive ? ' is-active' : ''}`}
        onClick={onMore}
      >
        <span className="mobile-tab-icon">
          <AppstoreOutlined />
        </span>
        <span className="mobile-tab-label">{moreLabel}</span>
      </button>
    </nav>
  );
}

/** 布局：固定顶栏 + 主体滚动；小屏追加底部 Tab。 */
export default function AppLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const items = useNavItems();
  const selected = '/' + (location.pathname.split('/')[1] ?? '');
  const [mobile, setMobile] = useState(() => isMobileViewport());
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    document.title = t('app.title');
  }, [t, i18n.language]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  const go = (key: string) => navigate(key);

  return (
    <Layout className={`app-shell${mobile ? ' is-mobile' : ''}`}>
      <Layout.Header
        className="app-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#fff',
          borderBottom: '2px solid var(--ink)',
          padding: mobile ? '0 12px' : '0 28px',
          height: mobile ? 52 : 60,
          lineHeight: 'normal',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          width: '100%',
        }}
      >
        <div
          onClick={() => navigate('/')}
          style={{ cursor: 'pointer', lineHeight: 1.1, flexShrink: 0 }}
        >
          <div className="wordmark">词迹</div>
          {!mobile && <div className="wordmark-sub">word traces</div>}
        </div>
        {!mobile && (
          <Menu
            theme="light"
            mode="horizontal"
            selectedKeys={[selected]}
            items={items}
            onClick={(e) => navigate(e.key)}
            style={{ flex: 1, minWidth: 0, marginLeft: 28 }}
          />
        )}
        <div style={{ flex: 1 }} />
        <LangSwitch />
        {!mobile && <div style={{ width: 14 }} />}
        {!mobile && <StreakChip />}
      </Layout.Header>

      <Layout.Content
        className="app-content"
        style={{
          padding: mobile ? '16px 12px 88px' : '26px 24px 40px',
          maxWidth: 920,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <Outlet />
      </Layout.Content>

      {mobile && (
        <MobileBottomNav
          items={items}
          selected={selected}
          onNav={go}
          onMore={() => setMoreOpen(true)}
        />
      )}

      <Drawer
        title={t('app.title')}
        placement="bottom"
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        height="auto"
        className="mobile-more-drawer"
      >
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={items}
          onClick={(e) => {
            navigate(e.key);
            setMoreOpen(false);
          }}
        />
        <ApiBaseEditor />
      </Drawer>
    </Layout>
  );
}
