/**
 * 发音跟读 Hook：SpeechRecognition 识别 → 词级评分 → 可选落库。
 * 供场景对话与单词练习共用。
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { App } from 'antd';
import { api } from '../api';
import {
  recognizeEnglish,
  scorePronunciation,
  speechRecognitionSupported,
  type PronounceResult,
} from '../pronounce';

export interface SavePronounceMeta {
  scenarioId?: number | null;
  lineId?: number | null;
  audio?: Blob | null;
  durationMs?: number;
}

export function usePronouncePractice() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [result, setResult] = useState<PronounceResult | null>(null);
  const [busy, setBusy] = useState(false);

  const practice = useCallback(
    async (target: string, meta: SavePronounceMeta = {}): Promise<PronounceResult | null> => {
      if (!speechRecognitionSupported()) {
        message.warning(t('speaking.asrUnsupported'));
        return null;
      }
      setBusy(true);
      try {
        const text = await recognizeEnglish();
        const scored = scorePronunciation(target, text);
        setResult(scored);
        await api.saveSpeakingRecord({
          target_text: target,
          transcript: text,
          score: scored.score,
          scenario_id: meta.scenarioId ?? null,
          line_id: meta.lineId ?? null,
          duration_ms: meta.durationMs ?? 0,
          audio: meta.audio ?? null,
        });
        message.success(t('speaking.scored', { n: scored.score }));
        return scored;
      } catch (e) {
        const msg = (e as Error).message;
        message.error(
          msg === 'UNSUPPORTED' ? t('speaking.asrUnsupported') : t('speaking.asrFailed', { msg }),
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [message, t],
  );

  /** 仅识别评分，不写库（已由录音路径单独保存时用）。 */
  const scoreOnly = useCallback(async (target: string): Promise<PronounceResult | null> => {
    if (!speechRecognitionSupported()) {
      message.warning(t('speaking.asrUnsupported'));
      return null;
    }
    setBusy(true);
    try {
      const text = await recognizeEnglish();
      const scored = scorePronunciation(target, text);
      setResult(scored);
      message.success(t('speaking.scored', { n: scored.score }));
      return scored;
    } catch (e) {
      const msg = (e as Error).message;
      message.error(
        msg === 'UNSUPPORTED' ? t('speaking.asrUnsupported') : t('speaking.asrFailed', { msg }),
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, [message, t]);

  const clear = useCallback(() => setResult(null), []);

  return {
    result,
    busy,
    asrSupported: speechRecognitionSupported(),
    practice,
    scoreOnly,
    clear,
    setResult,
  };
}
