/**
 * 全局客户端状态（zustand + localStorage 持久化）。
 * 轻量偏好 + 背单词会话快照（中断恢复），业务数据一律走后端。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { QueueItem } from './api';

export interface StudySessionSnapshot {
  bookId: number | null;
  mode: 'normal' | 'weak';
  items: QueueItem[];
  idx: number;
  counts: { review: number; new: number };
  answers: Record<number, { choice: number; correct: boolean }>;
  reveals: Record<number, boolean>;
  newRight: number;
  newWrong: number;
  reviewDone: number;
  savedAt: number;
}

interface StudyStore {
  newLimit: number;
  setNewLimit: (n: number) => void;
  newDirection: 'e2c' | 'c2e' | 'mixed';
  setNewDirection: (d: 'e2c' | 'c2e' | 'mixed') => void;
  reviewLimit: number;
  setReviewLimit: (n: number) => void;
  battleAvatar: string;
  setBattleAvatar: (a: string) => void;
  /** 未完成的背单词会话快照，刷新/关闭页面后可继续 */
  studySession: StudySessionSnapshot | null;
  saveStudySession: (s: StudySessionSnapshot) => void;
  clearStudySession: () => void;
}

export const useStudyStore = create<StudyStore>()(
  persist(
    (set) => ({
      newLimit: 10,
      setNewLimit: (n) => set({ newLimit: n }),
      newDirection: 'e2c',
      setNewDirection: (d) => set({ newDirection: d }),
      reviewLimit: 60,
      setReviewLimit: (n) => set({ reviewLimit: n }),
      battleAvatar: '👤',
      setBattleAvatar: (a) => set({ battleAvatar: a }),
      studySession: null,
      saveStudySession: (s) => set({ studySession: s }),
      clearStudySession: () => set({ studySession: null }),
    }),
    { name: 'study-settings' },
  ),
);
