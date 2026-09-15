/** 全局状态（zustand persist）测试：动作更新状态并写入 localStorage。 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudyStore } from '../store';

describe('study store', () => {
  beforeEach(() => {
    useStudyStore.setState({
      newLimit: 10,
      newDirection: 'e2c',
      battleAvatar: '👤',
    });
  });

  it('setNewLimit 更新每日新词数并持久化', () => {
    useStudyStore.getState().setNewLimit(20);
    expect(useStudyStore.getState().newLimit).toBe(20);
    const persisted = JSON.parse(localStorage.getItem('study-settings')!);
    expect(persisted.state.newLimit).toBe(20);
  });

  it('setNewDirection 更新新词方向并持久化', () => {
    useStudyStore.getState().setNewDirection('c2e');
    expect(useStudyStore.getState().newDirection).toBe('c2e');
    const persisted = JSON.parse(localStorage.getItem('study-settings')!);
    expect(persisted.state.newDirection).toBe('c2e');
  });

  it('setBattleAvatar 更新对战角色并持久化', () => {
    useStudyStore.getState().setBattleAvatar('🐱');
    expect(useStudyStore.getState().battleAvatar).toBe('🐱');
    const persisted = JSON.parse(localStorage.getItem('study-settings')!);
    expect(persisted.state.battleAvatar).toBe('🐱');
  });

  it('save/clear studySession 支持会话中断恢复', () => {
    const snap = {
      bookId: 1,
      mode: 'normal' as const,
      items: [],
      idx: 2,
      counts: { review: 3, new: 1 },
      answers: {},
      reveals: {},
      newRight: 1,
      newWrong: 0,
      reviewDone: 2,
      savedAt: Date.now(),
    };
    useStudyStore.getState().saveStudySession(snap);
    expect(useStudyStore.getState().studySession?.idx).toBe(2);
    useStudyStore.getState().clearStudySession();
    expect(useStudyStore.getState().studySession).toBeNull();
  });
});
