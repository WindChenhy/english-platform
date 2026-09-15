/** 难度标签：描边 Tag，颜色随级别变化。 */
import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import type { Level } from '../api';
import { LEVEL_COLOR } from '../constants/level';

export default function LevelTag({ level }: { level: Level }) {
  const { t } = useTranslation();
  const c = LEVEL_COLOR[level];
  return (
    <Tag style={{ color: c, borderColor: c, background: '#fff' }}>{t(`common.level.${level}`)}</Tag>
  );
}
