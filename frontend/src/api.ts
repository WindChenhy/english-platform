/**
 * 后端 API 客户端：集中定义与后端契约相关的类型和请求函数。
 * Web：相对路径 /api（Vite 代理或 FastAPI 同源托管）。
 * Tauri：经 apiUrl() 拼到本地后端绝对地址。
 */
import { apiUrl } from './env';

export type Level = 'beginner' | 'cet4' | 'cet6' | 'kaoyan';

/** 词书及其学习进度（learned/mastered/due_now 由后端聚合统计） */
export interface Book {
  id: number;
  code: string;
  name: string;
  level: Level;
  total: number;
  learned: number;
  mastered: number;
  due_now: number;
}

/** 词条富数据：例句、短语、近义词、同根词（来自词书 JSON） */
export interface WordDetail {
  sentences?: { en: string; zh: string }[];
  phrases?: { en: string; zh: string }[];
  synonyms?: { word: string; zh: string }[];
  related?: { pos?: string; word: string; zh: string }[];
}

/** 学习队列中的新词项 */
export interface QueueItemNew {
  type: 'new';
  quiz: 'e2c' | 'c2e';
  word: string;
  book_id: number;
  phonetic_us?: string | null;
  phonetic_uk?: string | null;
  meaning: string;
  options: string[];
  detail?: WordDetail | null;
}

/** 学习队列中的复习项 */
export interface QueueItemReview {
  type: 'review';
  card_id: number;
  word: string;
  phonetic?: string | null;
  meaning: string;
  lapses?: number;
}

export type QueueItem = QueueItemNew | QueueItemReview;

export interface QueueResp {
  items: QueueItem[];
  counts: { review: number; new: number };
}

export interface ReviewResp {
  word: string;
  rating: number;
  kind: string;
  interval: number;
  due: string;
  ease: number;
  stability?: number | null;
  difficulty?: number | null;
  state?: string;
}

export interface DictWord {
  word: string;
  phonetic?: string | null;
  translation?: string | null;
  definition?: string | null;
  tag?: string | null;
}

export interface DictSearchItem {
  word: string;
  phonetic?: string | null;
  translation?: string | null;
  tag?: string | null;
}

export interface ArticleListItem {
  id: number;
  title: string;
  level: Level;
  category?: string;
  exam_label?: string | null;
  word_count: number;
  attempt_count: number;
  best_score: number | null;
}

export interface ArticleQuestion {
  id: number;
  question: string;
  options: string[];
}

export interface ArticleDetail {
  id: number;
  title: string;
  level: Level;
  category?: string;
  exam_label?: string | null;
  content: string;
  word_count: number;
  questions: ArticleQuestion[];
  attempts: { correct: number; total: number; created_at: string }[];
}

export interface SpeakingScenarioItem {
  id: number;
  code: string;
  title: string;
  scene: string;
  level: string;
  description: string;
  line_count: number;
}

export interface SpeakingLine {
  id: number;
  ord: number;
  role: string;
  en: string;
  zh: string;
  tip?: string | null;
}

export interface SpeakingScenarioDetail extends SpeakingScenarioItem {
  lines: SpeakingLine[];
}

export interface SpeakingRecordItem {
  id: number;
  scenario_id: number | null;
  line_id: number | null;
  target_text: string;
  transcript: string;
  score: number;
  duration_ms: number;
  has_audio: boolean;
  study_date: string;
  created_at: string;
}

export interface SubmitResult {
  question_id: number;
  choice: number | null;
  correct: boolean;
  answer: number;
  explanation: string;
}

export interface SubmitResp {
  correct: number;
  total: number;
  results: SubmitResult[];
}

export interface MistakeItem {
  id: number;
  user_answer: number;
  created_at: string;
  resolved: boolean;
  question: {
    id: number;
    question: string;
    options: string[];
    answer: number;
    explanation: string;
  };
  article: { id: number; title: string };
}

export interface Goals {
  daily_new: number;
  daily_review: number;
}

export interface Stats {
  new_today: number;
  review_today: number;
  due_today: number;
  streak_days: number;
  vocab_estimate: number;
  wordlist_count: number;
  goals: Goals;
  dictation_today: number;
  battle_today: number;
  reading: {
    articles_done: number;
    articles_total: number;
    attempt_count: number;
    accuracy: number | null;
  };
}

export interface WordlistCard {
  id: number;
  word: string;
  meaning: string;
  phonetic?: string | null;
  interval: number;
  due: string;
  lapses?: number;
  state?: string;
}

export interface CardDetail {
  word: string;
  meaning: string;
  phonetic?: string | null;
  interval: number;
  due: string;
  ease: number;
  stability: number | null;
  difficulty: number | null;
  state: string;
  lapses: number;
  reps: number;
  source: string;
  suspended: boolean;
  buried: boolean;
}

export type DictationKind = 'word' | 'phrase' | 'sentence';

export interface DictationItem {
  id: string;
  prompt: string;
  answer: string;
  source?: string;
}

export interface DictationOverview {
  phrase_by_book: Record<string, number>;
  sentence_by_level: Record<string, number>;
  wordlist_count: number;
}

export interface ChartStats {
  daily: { date: string; new: number; review: number }[];
  cumulative: { date: string; total: number }[];
  heatmap: { date: string; n: number }[];
  forecast: { date: string; n: number }[];
  dictation_daily?: { date: string; correct: number; wrong: number }[];
}

export interface UserArticleItem {
  id: number;
  title: string;
  word_count: number;
  created_at: string;
}

export interface UserArticleDetail extends UserArticleItem {
  content: string;
}

export interface BattleConfig {
  suggested: 'easy' | 'normal' | 'hard';
  win_rate: number | null;
  recent: BattleLogItem[];
}

export interface BattleLogItem {
  id: number;
  difficulty: string;
  result: 'win' | 'draw' | 'lose';
  user_correct: number;
  total_rounds: number;
  avg_seconds: number;
  created_at: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(url), { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  books: () => req<Book[]>('/api/books'),

  queue: (
    bookId: number | null,
    newLimit: number,
    direction: string = 'e2c',
    mode: 'normal' | 'weak' = 'normal',
    reviewLimit = 60,
  ) =>
    req<QueueResp>(
      `/api/study/queue?new_limit=${newLimit}&direction=${direction}&mode=${mode}&review_limit=${reviewLimit}` +
        (bookId ? `&book_id=${bookId}` : ''),
    ),

  review: (body: { kind: 'new' | 'review'; word: string; rating: number; book_id?: number }) =>
    req<ReviewResp>('/api/study/review', { method: 'POST', body: JSON.stringify(body) }),

  wordlist: (q?: string, sort?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort) params.set('sort', sort);
    const qs = params.toString();
    return req<WordlistCard[]>(`/api/study/wordlist${qs ? `?${qs}` : ''}`);
  },

  addWordlist: (word: string) =>
    req<{ created: boolean; moved_into_today: boolean; word: string; meaning: string }>(
      '/api/study/wordlist',
      { method: 'POST', body: JSON.stringify({ word }) },
    ),

  removeWordlist: (word: string) =>
    req<{ deleted: boolean }>(`/api/study/wordlist/${encodeURIComponent(word)}`, {
      method: 'DELETE',
    }),

  getCard: (word: string) => req<CardDetail>(`/api/study/cards/${encodeURIComponent(word)}`),
  suspendCard: (word: string, days = 7) =>
    req<{ word: string; suspended_until: string }>(
      `/api/study/cards/${encodeURIComponent(word)}/suspend`,
      { method: 'POST', body: JSON.stringify({ days }) },
    ),
  buryCard: (word: string, days = 1) =>
    req<{ word: string; buried_until: string }>(
      `/api/study/cards/${encodeURIComponent(word)}/bury`,
      { method: 'POST', body: JSON.stringify({ days }) },
    ),
  unsuspendCard: (word: string) =>
    req<{ word: string; active: boolean }>(
      `/api/study/cards/${encodeURIComponent(word)}/unsuspend`,
      { method: 'POST' },
    ),

  dict: (word: string) => req<DictWord>(`/api/dictionary/${encodeURIComponent(word)}`),
  dictSearch: (q: string, limit = 12) =>
    req<{ items: DictSearchItem[] }>(
      `/api/dictionary/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),

  articles: (level?: string, category?: string) => {
    const p = new URLSearchParams();
    if (level) p.set('level', level);
    if (category) p.set('category', category);
    const qs = p.toString();
    return req<ArticleListItem[]>(`/api/articles${qs ? `?${qs}` : ''}`);
  },

  article: (id: number) => req<ArticleDetail>(`/api/articles/${id}`),

  submitArticle: (id: number, answers: { question_id: number; choice: number | null }[]) =>
    req<SubmitResp>(`/api/articles/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  userArticles: () => req<UserArticleItem[]>('/api/articles/user/list'),
  userArticle: (id: number) => req<UserArticleDetail>(`/api/articles/user/${id}`),
  createUserArticle: (title: string, content: string) =>
    req<{ id: number; title: string; word_count: number }>('/api/articles/user', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    }),
  deleteUserArticle: (id: number) =>
    req<{ deleted: boolean }>(`/api/articles/user/${id}`, { method: 'DELETE' }),

  mistakes: (resolved: boolean) => req<MistakeItem[]>(`/api/mistakes?resolved=${resolved}`),

  practice: (questionId: number, choice: number | null) =>
    req<{ correct: boolean; answer: number; explanation: string }>(
      `/api/mistakes/${questionId}/practice`,
      { method: 'POST', body: JSON.stringify({ choice }) },
    ),

  stats: () => req<Stats>('/api/stats'),
  charts: () => req<ChartStats>('/api/stats/charts'),

  goals: () => req<Goals>('/api/settings/goals'),
  saveGoals: (goals: Goals) =>
    req<Goals>('/api/settings/goals', { method: 'PUT', body: JSON.stringify(goals) }),

  importData: (payload: unknown) =>
    req<{
      cards: number;
      review_logs: number;
      reading_attempts: number;
      mistakes: number;
      dictation_logs?: number;
      battle_logs?: number;
      user_articles?: number;
    }>('/api/import', { method: 'POST', body: JSON.stringify(payload) }),

  dictationOverview: () => req<DictationOverview>('/api/dictation/overview'),

  dictationQuiz: (body: {
    kind: DictationKind;
    source?: 'book' | 'wordlist' | 'weak';
    book_id?: number | null;
    level?: string | null;
    count: number;
  }) => req<{ items: DictationItem[] }>('/api/dictation/quiz', { method: 'POST', body: JSON.stringify(body) }),

  dictationResult: (
    items: { kind: DictationKind; answer: string; correct: boolean; word?: string | null }[],
  ) =>
    req<{ saved: number }>('/api/dictation/result', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  battleConfig: () => req<BattleConfig>('/api/battle/config'),
  battleResult: (body: {
    difficulty: 'easy' | 'normal' | 'hard';
    result: 'win' | 'draw' | 'lose';
    user_correct: number;
    total_rounds: number;
    avg_seconds: number;
    wrong_words: string[];
  }) => req<{ id: number; result: string }>('/api/battle/result', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  battleHistory: (limit = 20) =>
    req<{ total: number; wins: number; items: BattleLogItem[] }>(`/api/battle/history?limit=${limit}`),

  speakingScenarios: (scene?: string) =>
    req<SpeakingScenarioItem[]>(
      `/api/speaking/scenarios${scene ? `?scene=${encodeURIComponent(scene)}` : ''}`,
    ),
  speakingWords: (opts: { book_id?: number; source?: 'book' | 'wordlist' | 'weak'; count?: number }) => {
    const p = new URLSearchParams();
    p.set('source', opts.source ?? 'book');
    p.set('count', String(opts.count ?? 20));
    if (opts.book_id != null) p.set('book_id', String(opts.book_id));
    return req<{ items: { word: string; meaning: string; phonetic?: string | null }[]; count: number }>(
      `/api/speaking/words?${p.toString()}`,
    );
  },
  speakingScenario: (id: number) => req<SpeakingScenarioDetail>(`/api/speaking/scenarios/${id}`),
  speakingRecords: (scenarioId?: number) =>
    req<SpeakingRecordItem[]>(
      `/api/speaking/records${scenarioId ? `?scenario_id=${scenarioId}` : ''}`,
    ),
  saveSpeakingRecord: async (body: {
    target_text: string;
    transcript?: string;
    score?: number;
    scenario_id?: number | null;
    line_id?: number | null;
    duration_ms?: number;
    audio?: Blob | null;
  }) => {
    const fd = new FormData();
    fd.set('target_text', body.target_text);
    fd.set('transcript', body.transcript ?? '');
    fd.set('score', String(body.score ?? 0));
    if (body.scenario_id != null) fd.set('scenario_id', String(body.scenario_id));
    if (body.line_id != null) fd.set('line_id', String(body.line_id));
    fd.set('duration_ms', String(body.duration_ms ?? 0));
    if (body.audio) fd.append('audio', body.audio, 'clip.webm');
    const res = await fetch(apiUrl('/api/speaking/records'), { method: 'POST', body: fd });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.detail ?? msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return res.json() as Promise<{ id: number; score: number; has_audio: boolean; study_date: string }>;
  },
  speakingAudioUrl: (id: number) => apiUrl(`/api/speaking/records/${id}/audio`),
  deleteSpeakingRecord: (id: number) =>
    req<{ deleted: boolean }>(`/api/speaking/records/${id}`, { method: 'DELETE' }),
  speakingStats: () =>
    req<{ total: number; avg_score: number; daily: { date: string; count: number; avg_score: number | null }[] }>(
      '/api/speaking/stats',
    ),
};
