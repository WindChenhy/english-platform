/** i18n 资源完整性测试：中英键结构一致、语言切换即时生效。 */
import { describe, expect, it } from 'vitest';
import i18n from '../i18n';

/** 扁平化嵌套对象，产出 "a.b.c" 形式的键集合。 */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flattenKeys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n 资源', () => {
  it('中文与英文的键完全一致（防止漏翻译）', () => {
    const zh = new Set(flattenKeys(i18n.getResourceBundle('zh', 'translation')));
    const en = new Set(flattenKeys(i18n.getResourceBundle('en', 'translation')));
    const missingInEn = [...zh].filter((k) => !en.has(k));
    const missingInZh = [...en].filter((k) => !zh.has(k));
    expect(missingInEn).toEqual([]);
    expect(missingInZh).toEqual([]);
  });

  it('键值不为空字符串', () => {
    const bundle = i18n.getResourceBundle('zh', 'translation');
    for (const v of Object.values(bundle)) {
      if (typeof v === 'string') expect(v.trim().length).toBeGreaterThan(0);
      else
        for (const vv of Object.values(v as Record<string, unknown>)) {
          if (typeof vv === 'string') expect(vv.trim().length).toBeGreaterThan(0);
        }
    }
  });
});

describe('语言切换', () => {
  it('changeLanguage 后 t() 即时生效', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('nav.home')).toBe('Home');
    await i18n.changeLanguage('zh');
    expect(i18n.t('nav.home')).toBe('首页');
  });

  it('未知语言回退到中文', async () => {
    await i18n.changeLanguage('fr');
    expect(i18n.t('nav.home')).toBe('首页');
    await i18n.changeLanguage('zh');
  });
});
