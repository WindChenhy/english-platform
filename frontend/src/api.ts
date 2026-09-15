/**
 * 后端 API 客户端：集中定义与后端契约相关的类型和请求函数。
 * 所有请求走相对路径 /api，开发期由 Vite 代理，生产由 FastAPI 同源托管。
 */

export type Level = 'beginner' | 'cet4' | 'cet6';

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

/** 学习队列中的新词项：quiz 区分英→中（options 为释义）与中→英（options 为单词） */
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

/** 学习队列中的复习项：翻面自评，不做四选一 */
export interface QueueItemReview {
  type: 'review';
  card_id: number;
  word: string;
  phonetic?: string | null;
  meaning: string;
}

export type QueueItem = QueueItemNew | QueueItemReview;

/** 学习队列响应：items 已由后端穿插排序，counts 为本轮构成 */
export interface QueueResp {
  items: QueueItem[];
  counts: { review: number; new: number };
}

/** 一次复习的 SM-2 结算结果 */
export interface ReviewResp {
  word: string;
  rating: number;
  kind: string;
  interval: number;
  due: string;
  ease: number;
}

/** 词典查询结果（ECDICT） */
export interface DictWord {
  word: string;
  phonetic?: string | null;
  translation?: string | null;
  definition?: string | null;
  tag?: string | null;
}

/** 文章列表项，best_score 为历史最好正确率 */
export interface ArticleListItem {
  id: number;
  title: string;
  level: Level;
  word_count: number;
  attempt_count: number;
  best_score: number | null;
}

/** 阅读理解题（不含答案，答案在提交后由后端返回） */
export interface ArticleQuestion {
  id: number;
  question: string;
  options: string[];
}

/** 文章详情：正文 + 理解题 + 历史做题记录 */
export interface ArticleDetail {
  id: number;
  title: string;
  level: Level;
  content: string;
  word_count: number;
  questions: ArticleQuestion[];
  attempts: { correct: number; total: number; created_at: string }[];
}

/** 单题判分结果 */
export interface SubmitResult {
  question_id: number;
  choice: number | null;
  correct: boolean;
  answer: number;
  explanation: string;
}

/** 整篇文章的提交判分响应 */
export interface SubmitResp {
  correct: number;
  total: number;
  results: SubmitResult[];
}

/** 错题本条目：题目、文章与作答信息聚合 */
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

/** 首页统计面板数据 */
export interface Stats {
  new_today: number;
  review_today: number;
  due_today: number;
  streak_days: number;
  vocab_estimate: number;
  wordlist_count: number;
  reading: {
    articles_done: number;
    articles_total: number;
    attempt_count: number;
    accuracy: number | null;
  };
}

/** 生词本卡片 */
export interface WordlistCard {
  id: number;
  word: string;
  meaning: string;
  phonetic?: string | null;
  interval: number;
  due: string;
}

export type DictationKind = 'word' | 'phrase' | 'sentence';

/** 默写出题项：prompt 为提示（中文释义/译文），answer 为需要默写的内容 */
export interface DictationItem {
  id: string;
  prompt: string;
  answer: string;
  source?: string;
}

/** 默写模块概览：各词书短语数、各级别句子数、生词本词数 */
export interface DictationOverview {
  phrase_by_book: Record<string, number>;
  sentence_by_level: Record<string, number>;
  wordlist_count: number;
}

/** 统计图表页数据：每日学习量、词汇增长、打卡热力图、到期预测 */
export interface ChartStats {
  daily: { date: string; new: number; review: number }[];
  cumulative: { date: string; total: number }[];
  heatmap: { date: string; n: number }[];
  forecast: { date: string; n: number }[];
}

/**
 * 通用请求封装：统一 JSON 头与错误信息提取（后端错误的 detail 字段直接透出）。
 * @throws Error 携带后端返回的 detail 文案
 */
async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
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

/** 平台全部后端接口的客户端集合 */
export const api = {
  /** 词书列表及进度 */
  books: () => req<Book[]>('/api/books'),

  /** 今日学习队列：bookId 为空表示"只复习全部到期卡"（无新词） */
  queue: (bookId: number | null, newLimit: number, direction: string = 'e2c') =>
    req<QueueResp>(
      `/api/study/queue?new_limit=${newLimit}&direction=${direction}${bookId ? `&book_id=${bookId}` : ''}`,
    ),

  /** 提交一次新词作答或复习自评，后端按 SM-2 结算 */
  review: (body: { kind: 'new' | 'review'; word: string; rating: number; book_id?: number }) =>
    req<ReviewResp>('/api/study/review', { method: 'POST', body: JSON.stringify(body) }),

  /** 生词本列表 */
  wordlist: () => req<WordlistCard[]>('/api/study/wordlist'),

  /** 收藏生词：建卡并今日到期；已存在时仅把到期日提前到今天 */
  addWordlist: (word: string) =>
    req<{ created: boolean; moved_into_today: boolean; word: string; meaning: string }>(
      '/api/study/wordlist',
      { method: 'POST', body: JSON.stringify({ word }) },
    ),

  /** 从生词本删除一个词 */
  removeWordlist: (word: string) =>
    req<{ deleted: boolean }>(`/api/study/wordlist/${encodeURIComponent(word)}`, {
      method: 'DELETE',
    }),

  /** 点词查词 */
  dict: (word: string) => req<DictWord>(`/api/dictionary/${encodeURIComponent(word)}`),

  /** 文章列表（可按难度过滤） */
  articles: (level?: string) =>
    req<ArticleListItem[]>(`/api/articles${level ? `?level=${level}` : ''}`),

  /** 文章详情（理解题不含答案） */
  article: (id: number) => req<ArticleDetail>(`/api/articles/${id}`),

  /** 提交阅读理解作答，后端判分并登记错题 */
  submitArticle: (id: number, answers: { question_id: number; choice: number | null }[]) =>
    req<SubmitResp>(`/api/articles/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  /** 错题本列表，resolved 区分未解决/已解决 */
  mistakes: (resolved: boolean) => req<MistakeItem[]>(`/api/mistakes?resolved=${resolved}`),

  /** 重练一道错题：答对后端自动将其标记为已解决 */
  practice: (questionId: number, choice: number | null) =>
    req<{ correct: boolean; answer: number; explanation: string }>(
      `/api/mistakes/${questionId}/practice`,
      { method: 'POST', body: JSON.stringify({ choice }) },
    ),

  /** 首页统计数据 */
  stats: () => req<Stats>('/api/stats'),

  /** 统计图表页数据 */
  charts: () => req<ChartStats>('/api/stats/charts'),

  /** 从 v2 备份文件恢复学习数据（整库覆盖当前记录） */
  importData: (payload: unknown) =>
    req<{ cards: number; review_logs: number; reading_attempts: number; mistakes: number }>(
      '/api/import',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  /** 默写模块概览 */
  dictationOverview: () => req<DictationOverview>('/api/dictation/overview'),

  /** 默写随机出题（单词/短语/句子三种模式） */
  dictationQuiz: (body: {
    kind: DictationKind;
    source?: 'book' | 'wordlist';
    book_id?: number | null;
    level?: string | null;
    count: number;
  }) => req<{ items: DictationItem[] }>('/api/dictation/quiz', { method: 'POST', body: JSON.stringify(body) }),
};
