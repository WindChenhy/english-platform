import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 构建（vite build）与单元测试（vitest）共用此配置
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    css: false,
  },
});
