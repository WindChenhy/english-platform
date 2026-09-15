/** 统计图表页：每日学习量、词汇增长曲线、打卡热力图、到期预测、默写正确率（recharts + 自绘热力图）。 */
import { useQuery } from '@tanstack/react-query';
import { Card, Col, Row, Tooltip, Typography } from 'antd';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { api } from '../api';

const AXIS_TICK = { fontSize: 11, fill: '#5a6b85' };
const TOOLTIP_STYLE = { border: '1px solid #d9e0e8', borderRadius: 8, fontSize: 12 };

/** 热力图单元格颜色：按当日学习量分五档（纸墨蓝阶）。 */
function heatColor(n: number): string {
  if (n <= 0) return '#eef1f5';
  if (n <= 2) return '#cfe0f5';
  if (n <= 5) return '#7fa5d7';
  if (n <= 9) return '#2b4c7e';
  return '#1c3760';
}

/** 本地时区的 YYYY-MM-DD，避免 toISOString 的 UTC 偏移问题。 */
function fmtLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 打卡热力图：自绘 SVG 网格，每列一周，颜色深浅表示当日学习量。 */
function Heatmap({ data }: { data: { date: string; n: number }[] }) {
  const { t } = useTranslation();
  const byDate = new Map(data.map((d) => [d.date, d.n]));
  const today = new Date();
  const todayStr = fmtLocal(today);

  // 从约 26 周前开始，起始日对齐到周一，每列一周
  const start = new Date(today);
  start.setDate(start.getDate() - 182);
  while (start.getDay() !== 1) start.setDate(start.getDate() - 1);

  const cols: { date: string; n: number }[][] = [];
  const cur = new Date(start);
  while (cur <= today) {
    const col: { date: string; n: number }[] = [];
    for (let i = 0; i < 7 && cur <= today; i++) {
      const ds = fmtLocal(cur);
      col.push({ date: ds, n: byDate.get(ds) ?? 0 });
      cur.setDate(cur.getDate() + 1);
    }
    cols.push(col);
  }

  return (
    <div>
      <div className="heatmap">
        {cols.map((col, ci) => (
          <div className="hm-col" key={ci}>
            {col.map((cell) => (
              <Tooltip key={cell.date} title={`${cell.date} · ${cell.n}`}>
                <div className="hm-cell" style={{ background: heatColor(cell.n) }} />
              </Tooltip>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Charts() {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({ queryKey: ['charts'], queryFn: api.charts });

  if (isLoading || !data) return <Card loading style={{ minHeight: 320 }} />;

  return (
    <Space16>
      <Card title={t('charts.daily30')} style={{ background: '#fff' }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf2" />
            <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={AXIS_TICK} interval={4} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} />
            <RTooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="new" name={t('charts.legendNew')} stackId="a" fill="#3b8c5a" />
            <Bar dataKey="review" name={t('charts.legendReview')} stackId="a" fill="#2b4c7e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Row gutter={[14, 14]}>
        <Col xs={24} md={12}>
          <Card title={t('charts.cumulative')} style={{ background: '#fff' }}>
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={data.cumulative} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf2" />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <RTooltip contentStyle={TOOLTIP_STYLE} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name={t('charts.legendTotal')}
                  stroke="#2b4c7e"
                  fill="#cfe0f5"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={t('charts.forecast')} style={{ background: '#fff' }}>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={data.forecast} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf2" />
                <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={AXIS_TICK} interval={2} />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <RTooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="n" name={t('charts.dueCards')} fill="#d98f2b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Col>
      </Row>

      {data.dictation_daily && data.dictation_daily.some((d) => d.correct + d.wrong > 0) && (
        <Card title={t('charts.dictation30')} style={{ background: '#fff' }}>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.dictation_daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7ecf2" />
              <XAxis dataKey="date" tickFormatter={(v: string) => v.slice(5)} tick={AXIS_TICK} interval={2} />
              <YAxis tick={AXIS_TICK} allowDecimals={false} />
              <RTooltip contentStyle={TOOLTIP_STYLE} />
              <Legend />
              <Bar dataKey="correct" name={t('charts.dictCorrect')} stackId="d" fill="#3b8c5a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="wrong" name={t('charts.dictWrong')} stackId="d" fill="#d64550" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card
        title={t('charts.heatmap')}
        style={{ background: '#fff' }}
        extra={
          data.heatmap.length > 0 && (
            <div className="hm-legend" style={{ marginTop: 0 }}>
              <span className="detail-cn">{t('charts.less')}</span>
              {[0, 2, 5, 9, 12].map((n) => (
                <div key={n} className="hm-cell" style={{ background: heatColor(n) }} />
              ))}
              <span className="detail-cn">{t('charts.more')}</span>
            </div>
          )
        }
      >
        {data.heatmap.length > 0 ? (
          <Heatmap data={data.heatmap} />
        ) : (
          <Typography.Text type="secondary">{t('charts.empty')}</Typography.Text>
        )}
      </Card>
    </Space16>
  );
}

/** 竖向 16px 间距容器：用 flex gap，避免嵌套 antd Space 带来额外节点。 */
function Space16({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
  );
}
