/**
 * 默写判分工具：答案归一化、逐词 LCS 对比（生成批改视图）、首字母遮罩提示。
 * 判分口径：忽略大小写、弯直引号差异、多余空白与标点符号（按词比较时）。
 */

/**
 * 归一化文本：转小写、统一引号、折叠空白。
 * @param s 原始输入
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 去掉标点的归一化（用于逐词相等性比较，标点写错不算错）。
 * @param s 单个单词或短句
 */
function stripPunct(s: string): string {
  return normalizeText(s)
    .replace(/[.,!?;:'"()\-—–]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 单个对比词：ok=正确，missing=漏写的正确词，extra=写错/多写的词 */
export type DiffToken = { word: string; status: 'ok' | 'missing' | 'extra' };

/**
 * 逐词 LCS 对比，生成批改视图用的词序列。
 * @param expected 正确答案
 * @param typed 用户输入
 */
export function diffTokens(expected: string, typed: string): DiffToken[] {
  const e = normalizeText(expected).split(' ');
  const t = normalizeText(typed).split(' ').filter(Boolean);
  const n = e.length;
  const m = t.length;
  // dp[i][j] = expected[i..] 与 typed[j..] 的最长公共子序列长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = stripPunct(e[i]) === stripPunct(t[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  // 按 LCS 回溯，产出对齐后的词序列；平局时优先推进 extra（读起来更自然）
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (stripPunct(e[i]) === stripPunct(t[j])) {
      out.push({ word: t[j], status: 'ok' });
      i++;
      j++;
    } else if (dp[i + 1][j] > dp[i][j + 1]) {
      out.push({ word: e[i], status: 'missing' });
      i++;
    } else {
      out.push({ word: t[j], status: 'extra' });
      j++;
    }
  }
  while (i < n) out.push({ word: e[i++], status: 'missing' });
  while (j < m) out.push({ word: t[j++], status: 'extra' });
  return out;
}

/**
 * 判定默写结果：所有词都对齐且输入非空即为正确。
 * @param expected 正确答案
 * @param typed 用户输入
 */
export function gradeAnswer(expected: string, typed: string): { ok: boolean; tokens: DiffToken[] } {
  const tokens = diffTokens(expected, typed);
  const ok = typed.trim().length > 0 && tokens.every((t) => t.status === 'ok');
  return { ok, tokens };
}

/**
 * 生成首字母提示：每个单词保留首字母，其余字母换成下划线。
 * 空白与连字符视作词边界（"ice-cream" → "i__-c____"），撇号等其余字符原样保留。
 * @param answer 正确答案
 */
export function maskAnswer(answer: string): string {
  return answer
    .split(/(\s+)/) // 保留空白分隔符，避免多个空格被折叠
    .map((part) => {
      if (/^\s*$/.test(part)) return part;
      let seen = false;
      return part
        .split('')
        .map((ch) => {
          if (/[a-zA-Z]/.test(ch)) {
            if (!seen) {
              seen = true;
              return ch;
            }
            return '_';
          }
          if (ch === '-') seen = false; // 连字符后视作新词首
          return ch;
        })
        .join('');
    })
    .join('');
}
