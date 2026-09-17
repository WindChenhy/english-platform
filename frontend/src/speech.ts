/**
 * 单词/例句发音：经平台适配器调用 TTS（Web/Tauri/Capacitor 可替换实现）。
 */
import { getSpeechAdapter } from './platform';

/** 朗读一段英文文本（重复调用会打断上一次朗读）。 */
export function speak(text: string) {
  getSpeechAdapter().speak(text);
}

export function cancelSpeak() {
  getSpeechAdapter().cancelSpeak();
}
