/**
 * 运行时选择语音适配器。
 * 当前：Tauri / Capacitor 暂回退到 WebView 内 Web Speech；
 * 后续可在对应分支换成原生 TTS/ASR 插件或 sidecar，业务代码无需改。
 */
import { isTauri } from '../env';
import type { SpeechAdapter } from './types';
import { createWebSpeechAdapter } from './web';

function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}

let cached: SpeechAdapter | null = null;

export function getSpeechAdapter(): SpeechAdapter {
  if (cached) return cached;
  // 识别环境；原生实现就绪后在此分支替换
  if (isCapacitor()) {
    // 预留：return createCapacitorSpeechAdapter();
    cached = createWebSpeechAdapter();
  } else if (isTauri()) {
    // 预留：return createTauriSpeechAdapter();
    cached = createWebSpeechAdapter();
  } else {
    cached = createWebSpeechAdapter();
  }
  return cached;
}

/** 测试用：重置缓存以便注入 mock。 */
export function __setSpeechAdapter(adapter: SpeechAdapter | null) {
  cached = adapter;
}

export type { SpeechAdapter, RecordingResult, ActiveRecording } from './types';
