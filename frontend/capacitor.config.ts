import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.wordtraces.english',
  appName: '词迹',
  webDir: 'dist',
  server: {
    // 开发时可改为本机调试地址；生产加载打包的 dist
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
