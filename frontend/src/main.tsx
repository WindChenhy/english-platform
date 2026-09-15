/** 应用入口：装配 i18n、路由、全局状态缓存与跟随语言的 antd 主题。 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import React, { type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import i18n from './i18n';
import './index.css';

// 全局服务端状态缓存：失败重试 1 次，10 秒内视作新鲜数据
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 10_000 },
  },
});

/** 语言桥：跟随 i18n 当前语言切换 antd 组件语言包与 dayjs 日期语言。 */
function AntdLocaleBridge({ children }: { children: ReactNode }) {
  const { i18n: i18nInst } = useTranslation();
  const isZh = i18nInst.language.startsWith('zh');
  // 渲染期设置全局日期语言，保证本次渲染的日期文本就是目标语言
  dayjs.locale(isZh ? 'zh-cn' : 'en');
  return <ConfigProvider locale={isZh ? zhCN : enUS}>{children}</ConfigProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AntdLocaleBridge>
          <AntApp>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AntApp>
        </AntdLocaleBridge>
      </QueryClientProvider>
    </I18nextProvider>
  </React.StrictMode>,
);
