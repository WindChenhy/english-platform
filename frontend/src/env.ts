/**
 * 运行环境探测与 API 基址。
 * Web：相对路径 /api（Vite 代理或 FastAPI 同源托管）。
 * Tauri / Capacitor：页面在自定义协议源，必须指向后端绝对地址。
 */

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 'Capacitor' in window;
}

/** 原生壳（桌面 Tauri 或移动 Capacitor） */
export function isNativeShell(): boolean {
  return isTauri() || isCapacitor();
}

/** 小屏（含手机 WebView）粗判，供布局切换；也可用 CSS 断点。 */
export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

const DEFAULT_NATIVE_API = 'http://127.0.0.1:8000';

/** API 前缀：Web 为空串；原生壳默认本机后端，可用 VITE_API_BASE 或 localStorage 覆盖。 */
export function apiBase(): string {
  if (!isNativeShell()) return '';
  try {
    const saved = localStorage.getItem('ep_api_base');
    if (saved) return saved.replace(/\/$/, '');
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_API_BASE as string | undefined) ?? DEFAULT_NATIVE_API;
}

export function setApiBase(url: string) {
  try {
    localStorage.setItem('ep_api_base', url.replace(/\/$/, ''));
  } catch {
    /* ignore */
  }
}

/** 拼接 API 路径。 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return apiBase() + path;
}

/**
 * 触发浏览器/WebView 文件下载。
 * Tauri 下 window.open(相对路径) 无效，须用绝对 URL + Blob。
 */
export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const res = await fetch(apiUrl(path));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
