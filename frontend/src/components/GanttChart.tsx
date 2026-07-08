import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getLevelColor } from '../constants/levelColors';

export interface GanttSegment {
  level: string;
  startDate: string;
  endDate: string | null;
  durationDays: number;
}

export interface GanttRow {
  name: string;
  segments: GanttSegment[];
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload: Record<string, string | number>;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const segments = payload.filter((p) => p.dataKey.startsWith('seg') && p.value > 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      {label && <strong>{label}</strong>}
      {segments.map((p) => {
        const i = p.dataKey.replace('seg', '');
        return (
          <div key={p.dataKey} style={{ textTransform: 'capitalize' }}>
            {p.payload[`level${i}`]}: {p.value} days ({p.payload[`start${i}`]} → {p.payload[`end${i}`]})
          </div>
        );
      })}
    </div>
  );
}

function diffInDays(startDate: string, endDate: string): number {
  return Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Generic multi-row Gantt chart: one row per `GanttRow`, segments positioned
 * on a shared calendar timeline via invisible spacer bars (since a row's
 * segments can have gaps between them). Used both for one employee's
 * per-skill level journey, and for an org-wide overview of every employee's
 * overall level journey.
 */
export function GanttChart({ rows, rowHeight = 50, yAxisWidth = 90 }: { rows: GanttRow[]; rowHeight?: number; yAxisWidth?: number }) {
  if (rows.length === 0) {
    return <div style={{ color: '#999' }}>Nothing to chart yet.</div>;
  }

  const allStarts = rows.flatMap((row) => row.segments.map((s) => s.startDate));
  const chartStart = allStarts.reduce((min, d) => (d < min ? d : min), allStarts[0]);
  const maxSegments = Math.max(...rows.map((row) => row.segments.length));
  const distinctLevels = [...new Set(rows.flatMap((row) => row.segments.map((s) => s.level)))];

  const data = rows.map((row) => {
    const sorted = [...row.segments].sort((a, b) => a.startDate.localeCompare(b.startDate));
    const obj: Record<string, string | number> = { name: row.name };
    let cursor = 0;
    sorted.forEach((seg, i) => {
      const startOffset = diffInDays(chartStart, seg.startDate);
      obj[`gap${i}`] = Math.max(0, startOffset - cursor);
      obj[`seg${i}`] = seg.durationDays;
      obj[`level${i}`] = seg.level;
      obj[`start${i}`] = seg.startDate;
      obj[`end${i}`] = seg.endDate ?? 'present';
      cursor = startOffset + seg.durationDays;
    });
    for (let i = sorted.length; i < maxSegments; i++) {
      obj[`gap${i}`] = 0;
      obj[`seg${i}`] = 0;
    }
    return obj;
  });

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * rowHeight)}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, left: 8, right: 8, bottom: 8 }}>
          <XAxis type="number" tickFormatter={(v) => `${v}d`} />
          <YAxis type="category" dataKey="name" width={yAxisWidth} />
          <Tooltip content={<ChartTooltip />} />
          {Array.from({ length: maxSegments }).flatMap((_, i) => [
            <Bar key={`gap${i}`} dataKey={`gap${i}`} stackId="a" fill="transparent" />,
            <Bar key={`seg${i}`} dataKey={`seg${i}`} stackId="a">
              {data.map((row, rowIndex) => (
                <Cell
                  key={rowIndex}
                  fill={row[`level${i}`] ? getLevelColor(row[`level${i}`] as string) : 'transparent'}
                />
              ))}
            </Bar>,
          ])}
        </BarChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        {distinctLevels.map((level) => (
          <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{ width: 10, height: 10, background: getLevelColor(level), display: 'inline-block', borderRadius: 2 }}
            />
            <span style={{ textTransform: 'capitalize', fontSize: 12 }}>{level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
