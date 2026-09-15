/** 判分工具（grade.ts）单元测试：归一化、逐词对比、结果判定与首字母遮罩。 */
import { describe, expect, it } from 'vitest';
import { diffTokens, gradeAnswer, maskAnswer, normalizeText } from '../grade';

describe('normalizeText', () => {
  it('转小写、统一弯引号、折叠空白', () => {
    expect(normalizeText("Don't  Stop “Me” Now")).toBe("don't stop \"me\" now");
  });
});

describe('diffTokens', () => {
  it('完全一致时全部为 ok', () => {
    const tokens = diffTokens('i like apples', 'I like Apples');
    expect(tokens.every((t) => t.status === 'ok')).toBe(true);
  });

  it('漏写的词标记为 missing', () => {
    const tokens = diffTokens('a b c', 'a c');
    expect(tokens).toEqual([
      { word: 'a', status: 'ok' },
      { word: 'b', status: 'missing' },
      { word: 'c', status: 'ok' },
    ]);
  });

  it('写错/多写的词标记为 extra', () => {
    const tokens = diffTokens('a b c', 'a x c');
    expect(tokens).toEqual([
      { word: 'a', status: 'ok' },
      { word: 'x', status: 'extra' },
      { word: 'b', status: 'missing' },
      { word: 'c', status: 'ok' },
    ]);
  });

  it('标点差异不影响逐词相等性', () => {
    const tokens = diffTokens('hello, world.', 'hello world');
    expect(tokens.every((t) => t.status === 'ok')).toBe(true);
  });
});

describe('gradeAnswer', () => {
  it('正确（忽略大小写与标点）', () => {
    expect(gradeAnswer('The Big Apple.', 'the big apple').ok).toBe(true);
  });

  it('空输入判错', () => {
    expect(gradeAnswer('apple', '   ').ok).toBe(false);
  });

  it('拼写错误判错并给出批改词序', () => {
    const { ok, tokens } = gradeAnswer('serendipity', 'serendipitye');
    expect(ok).toBe(false);
    expect(tokens.some((t) => t.status === 'extra')).toBe(true);
    expect(tokens.some((t) => t.status === 'missing')).toBe(true);
  });

  it('弯引号与直引号等价', () => {
    expect(gradeAnswer("don't stop", "don’t stop").ok).toBe(true);
  });
});

describe('maskAnswer', () => {
  it('每个单词保留首字母，其余字母打码', () => {
    expect(maskAnswer('apple')).toBe('a____');
    expect(maskAnswer('a big dog')).toBe('a b__ d__');
  });

  it('非字母字符原样保留，连字符后视作新词首', () => {
    expect(maskAnswer("ice-cream, don't")).toBe("i__-c____, d__'_");
  });
});
