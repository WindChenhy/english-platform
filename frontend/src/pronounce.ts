/**
 * 发音识别与评分：Web Speech API + 词级对齐。
 * 依赖 Chrome/Edge 的 SpeechRecognition；不支持时返回明确错误。
 */

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
      // 模糊匹配：前 3 字母相同也算部分命中
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
  // 识别长度差惩罚：过短/过长都扣分
  const lenPenalty =
    uWords.length === 0 ? 0.5 : Math.min(0.25, Math.abs(uWords.length - tWords.length) / (tWords.length * 2));
  const score = Math.round(Math.max(0, Math.min(100, (hitRate - lenPenalty) * 100)));
  return { score, transcript, words, missing };
}

type SpeechRecognitionCtor = new () => {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechRecognitionSupported(): boolean {
  return !!getRecognitionCtor();
}

/**
 * 识别一次英文语音（约数秒），resolve 识别文本。
 * @throws Error 浏览器不支持或用户拒绝麦克风时
 */
export function recognizeEnglish(timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      reject(new Error('UNSUPPORTED'));
      return;
    }
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let done = false;
    const timer = window.setTimeout(() => {
      if (!done) {
        done = true;
        try {
          rec.stop();
        } catch {
          /* ignore */
        }
      }
    }, timeoutMs);

    rec.onresult = (e) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      const text = e.results?.[0]?.[0]?.transcript ?? '';
      resolve(text);
    };
    rec.onerror = (e) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      reject(new Error(e.error || 'ERROR'));
    };
    rec.onend = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      resolve('');
    };
    try {
      rec.start();
    } catch (e) {
      done = true;
      window.clearTimeout(timer);
      reject(e as Error);
    }
  });
}
