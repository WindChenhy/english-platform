/** 发音评分单元测试：词级命中与分数区间。 */
import { describe, expect, it } from 'vitest';
import { scorePronunciation } from '../pronounce';

describe('scorePronunciation', () => {
  it('完全匹配应得高分', () => {
    const r = scorePronunciation('Where is the gate?', 'where is the gate');
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.missing).toEqual([]);
    expect(r.words.every((w) => w.ok)).toBe(true);
  });

  it('大量漏读应低分', () => {
    const r = scorePronunciation(
      'The quick brown fox jumps over the lazy dog',
      'quick fox',
    );
    expect(r.score).toBeLessThan(50);
    expect(r.missing.length).toBeGreaterThan(3);
  });

  it('空识别返回 0 分', () => {
    const r = scorePronunciation('Hello world', '');
    expect(r.score).toBe(0);
  });

  it('大小写与标点不影响匹配', () => {
    const r = scorePronunciation('I am fine.', 'I am fine!');
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
});
