/**
 * Web 默认实现：SpeechSynthesis / SpeechRecognition / MediaRecorder。
 * 桌面 Tauri 与移动端 Capacitor 可在此基础上替换为原生能力。
 */
import type { ActiveRecording, RecordingResult, SpeechAdapter } from './types';

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

function recognizeEnglish(timeoutMs = 8000): Promise<string> {
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
      resolve(e.results?.[0]?.[0]?.transcript ?? '');
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

async function startRecording(): Promise<ActiveRecording> {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('UNSUPPORTED');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  const mimeType = preferred.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise<RecordingResult>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      resolve({
        blob,
        durationMs: Date.now() - startedAt,
        mimeType: recorder.mimeType || 'audio/webm',
      });
    };
  });

  recorder.start();

  return {
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop();
      return stopped;
    },
    cancel: () => {
      stream.getTracks().forEach((t) => t.stop());
      if (recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
    },
  };
}

export function createWebSpeechAdapter(): SpeechAdapter {
  return {
    kind: 'web',
    speak(text: string) {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US';
      u.rate = 0.95;
      window.speechSynthesis.speak(u);
    },
    cancelSpeak() {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
    ttsSupported: () => typeof window !== 'undefined' && 'speechSynthesis' in window,
    speechRecognitionSupported: () => !!getRecognitionCtor(),
    recognizeEnglish,
    mediaRecorderSupported: () =>
      typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia,
    startRecording,
  };
}
