/**
 * 录音：经平台适配器调用（Web MediaRecorder / 后续原生插件）。
 */
import { getSpeechAdapter } from './platform';
import type { RecordingResult } from './platform';

export type { RecordingResult };

export function mediaRecorderSupported(): boolean {
  return getSpeechAdapter().mediaRecorderSupported();
}

/** 开始录音，返回 stop() 以结束并取回音频。 */
export async function startRecording(): Promise<{
  stop: () => Promise<RecordingResult>;
  cancel: () => void;
}> {
  return getSpeechAdapter().startRecording();
}

/** 把 Blob 转成可播放的 object URL（调用方负责 revoke）。 */
export function blobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
