/** 应用集成冒烟：真实 i18n + 路由 + antd，fetch 打桩后渲染首页，验证导航随语言切换。 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import i18n from '../i18n';

/** 打桩所有 /api 请求，返回空数据集（够渲染结构即可）。 */
function stubFetch() {
  const response = (body: unknown) => ({
    ok: true,
    status: 200,
    json: async () => body,
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/api/stats/charts')) {
        return response({ daily: [], cumulative: [], heatmap: [], forecast: [] });
      }
      if (u.includes('/api/stats')) {
        return response({
          new_today: 0, review_today: 0, due_today: 0, streak_days: 0,
          vocab_estimate: 0, wordlist_count: 0,
          reading: { articles_done: 0, articles_total: 30, attempt_count: 0, accuracy: null },
        });
      }
      if (u.includes('/api/books') || u.includes('/api/articles') || u.includes('/api/study/wordlist')) {
        return response([]);
      }
      if (u.includes('/api/mistakes')) return response([]);
      return response([]);
    }),
  );
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AntApp>
          <ConfigProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </ConfigProvider>
        </AntApp>
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

beforeEach(() => {
  stubFetch();
  return i18n.changeLanguage('zh');
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('App 集成冒烟', () => {
  it('渲染主导航与首页统计盒（中文）', async () => {
    renderApp();
    expect(await screen.findByText('首页')).toBeTruthy();
    // 导航与卡片标题可能同文，用 getAllByText 宽松断言
    expect(screen.getAllByText('背单词').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('默写')).toBeTruthy();
    expect(screen.getByText('对战')).toBeTruthy();
    expect(screen.getByText('统计')).toBeTruthy();
    // 等待 stats 请求完成后的统计盒
    await screen.findByText('今日新学');
    expect(screen.getByText('词汇量估算')).toBeTruthy();
  });

  it('切换到英文后导航文案变为英文', async () => {
    renderApp();
    await screen.findByText('首页');
    await i18n.changeLanguage('en');
    expect(screen.getAllByText('Study').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Word List')).toBeTruthy();
    expect(screen.queryByText('背单词')).toBeNull();
    await i18n.changeLanguage('zh');
  });

  it('页面标题跟随语言', async () => {
    renderApp();
    await i18n.changeLanguage('en');
    expect(document.title).toContain('WordTraces');
    await i18n.changeLanguage('zh');
    expect(document.title).toContain('英语学习平台');
  });
});
