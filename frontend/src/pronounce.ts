/**
 * 发音识别与评分：ASR 走平台适配器；词级对齐评分为纯函数。
 */
import { getSpeechAdapter } from './platform';

export interface PronounceWord {
  word: string;
  ok: boolean;
}

export interface PronounceResult {
  score: number;
  transcript: string;
  words: PronounceWord[];
  missing: string[];
}

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** 词级对齐评分：命中率 − 长度差惩罚，输出 0-100 与逐词命中；前缀模糊仅作漏读提示，不计为命中。 */
export function scorePronunciation(target: string, transcript: string): PronounceResult {
  const tWords = normalizeWords(target);
  const uWords = normalizeWords(transcript);
  if (tWords.length === 0) {
    return { score: 0, transcript, words: [], missing: [] };
  }

  const used = new Array(uWords.length).fill(false);
  const words: PronounceWord[] = [];
  const missing: string[] = [];

  for (const w of tWords) {
    let hit = -1;
    for (let i = 0; i < uWords.length; i++) {
      if (!used[i] && uWords[i] === w) {
        hit = i;
        break;
      }
    }
    if (hit >= 0) {
      used[hit] = true;
      words.push({ word: w, ok: true });
    } else {
      let fuzzy = -1;
      for (let i = 0; i < uWords.length; i++) {
        if (used[i]) continue;
        const a = uWords[i].slice(0, 3);
        const b = w.slice(0, 3);
        if (a && a === b) {
          fuzzy = i;
          break;
        }
      }
      if (fuzzy >= 0) {
        used[fuzzy] = true;
        words.push({ word: w, ok: false });
        missing.push(w);
      } else {
        words.push({ word: w, ok: false });
        missing.push(w);
      }
    }
  }

  const exact = words.filter((x) => x.ok).length;
  const hitRate = exact / tWords.length;
  const lenPenalty =
    uWords.length === 0 ? 0.5 : Math.min(0.25, Math.abs(uWords.length - tWords.length) / (tWords.length * 2));
  const score = Math.round(Math.max(0, Math.min(100, (hitRate - lenPenalty) * 100)));
  return { score, transcript, words, missing };
}

export function speechRecognitionSupported(): boolean {
  return getSpeechAdapter().speechRecognitionSupported();
}

/** 识别一次英文语音；不支持或失败时 reject（UNSUPPORTED 等）。 */
export function recognizeEnglish(timeoutMs = 8000): Promise<string> {
  return getSpeechAdapter().recognizeEnglish(timeoutMs);
}
