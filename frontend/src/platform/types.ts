/** 跨端能力适配器：语音 TTS/ASR 与录音。业务层只依赖本接口。 */

export interface RecordingResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

export interface ActiveRecording {
  stop: () => Promise<RecordingResult>;
  cancel: () => void;
}

export interface SpeechAdapter {
  /** 平台标识，便于调试与 UI 提示 */
  readonly kind: 'web' | 'tauri' | 'capacitor';
  speak(text: string): void;
  cancelSpeak(): void;
  ttsSupported(): boolean;
  speechRecognitionSupported(): boolean;
  recognizeEnglish(timeoutMs?: number): Promise<string>;
  mediaRecorderSupported(): boolean;
  startRecording(): Promise<ActiveRecording>;
}
