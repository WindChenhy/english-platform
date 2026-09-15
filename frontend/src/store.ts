/**
 * 全局客户端状态（zustand + localStorage 持久化）。
 * 只放需要跨页面/跨会话记住的轻量偏好，业务数据一律走后端。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StudyStore {
  /** 每日学习的新词数量上限 */
  newLimit: number;
  setNewLimit: (n: number) => void;
  /** 背单词新词方向：e2c 英→中 / c2e 中→英 / mixed 混合 */
  newDirection: 'e2c' | 'c2e' | 'mixed';
  setNewDirection: (d: 'e2c' | 'c2e' | 'mixed') => void;
  /** 对战模式下用户选择的角色 emoji */
  battleAvatar: string;
  setBattleAvatar: (a: string) => void;
}

export const useStudyStore = create<StudyStore>()(
  persist(
    (set) => ({
      newLimit: 10,
      setNewLimit: (n) => set({ newLimit: n }),
      newDirection: 'e2c',
      setNewDirection: (d) => set({ newDirection: d }),
      battleAvatar: '👤',
      setBattleAvatar: (a) => set({ battleAvatar: a }),
    }),
    { name: 'study-settings' },
  ),
);
