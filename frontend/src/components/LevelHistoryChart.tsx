import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { LevelHistoryEntry } from '../types/employee';
import { getLevelColor } from '../constants/levelColors';

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  payload: Record<string, string | number>;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const segments = payload.filter((p) => p.dataKey.startsWith('seg') && p.value > 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      {segments.map((p) => {
        const i = p.dataKey.replace('seg', '');
        return (
          <div key={p.dataKey} style={{ textTransform: 'capitalize' }}>
            <strong>{p.payload[`level${i}`]}</strong>: {p.value} days ({p.payload[`start${i}`]} → {p.payload[`end${i}`]})
          </div>
        );
      })}
    </div>
  );
}

/** Single-row Gantt bar showing the Junior -> Middle -> Senior journey, segments proportional to days spent. */
export function LevelHistoryChart({ entries }: { entries: LevelHistoryEntry[] }) {
  if (entries.length === 0) {
    return null;
  }

  const sorted = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const row: Record<string, string | number> = { name: 'Level' };
  sorted.forEach((entry, i) => {
    row[`seg${i}`] = entry.durationDays;
    row[`level${i}`] = entry.level ?? 'Unknown';
    row[`start${i}`] = entry.startDate;
    row[`end${i}`] = entry.endDate ?? 'present';
  });

  return (
    <ResponsiveContainer width="100%" height={100}>
      <BarChart data={[row]} layout="vertical" margin={{ top: 8, left: 8, right: 8, bottom: 8 }}>
        <XAxis type="number" tickFormatter={(v) => `${v}d`} />
        <YAxis type="category" dataKey="name" hide />
        <Tooltip content={<ChartTooltip />} />
        {sorted.map((entry, i) => (
          <Bar key={i} dataKey={`seg${i}`} stackId="a" fill={getLevelColor(entry.level ?? 'Unknown')} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
