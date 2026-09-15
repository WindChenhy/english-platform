/**
 * 浏览器录音：MediaRecorder 封装，产出 Blob 供上传与本地回放。
 */

export interface RecordingResult {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

export function mediaRecorderSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** 开始录音，返回 stop() 以结束并取回音频。 */
export async function startRecording(): Promise<{
  stop: () => Promise<RecordingResult>;
  cancel: () => void;
}> {
  if (!mediaRecorderSupported()) {
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
      resolve({ blob, durationMs: Date.now() - startedAt, mimeType: recorder.mimeType || 'audio/webm' });
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

/** 把 Blob 转成可播放的 object URL（调用方负责 revoke）。 */
export function blobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
