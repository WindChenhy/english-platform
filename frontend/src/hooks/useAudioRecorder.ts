/**
 * 浏览器录音 Hook：封装 MediaRecorder 启停、object URL 生命周期与上传用 Blob。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { blobUrl, mediaRecorderSupported, startRecording, type RecordingResult } from '../record';

export interface AudioRecorderState {
  recording: boolean;
  url?: string;
  blob?: Blob;
  durationMs: number;
}

export function useAudioRecorder() {
  const [state, setState] = useState<AudioRecorderState>({ recording: false, durationMs: 0 });
  const recorderRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const urlRef = useRef<string | null>(null);

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    recorderRef.current?.cancel();
    revoke();
  }, [revoke]);

  const start = useCallback(async () => {
    if (!mediaRecorderSupported()) throw new Error('UNSUPPORTED');
    revoke();
    const r = await startRecording();
    recorderRef.current = r;
    setState({ recording: true, durationMs: 0 });
  }, [revoke]);

  /** 停止录音，返回结果；调用方负责上传。 */
  const stop = useCallback(async (): Promise<RecordingResult> => {
    const r = await recorderRef.current!.stop();
    const url = blobUrl(r.blob);
    revoke();
    urlRef.current = url;
    setState({ recording: false, url, blob: r.blob, durationMs: r.durationMs });
    return r;
  }, [revoke]);

  const reset = useCallback(() => {
    recorderRef.current?.cancel();
    revoke();
    setState({ recording: false, durationMs: 0 });
  }, [revoke]);

  return {
    ...state,
    supported: mediaRecorderSupported(),
    start,
    stop,
    reset,
  };
}
