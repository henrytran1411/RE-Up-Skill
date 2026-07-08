import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { EmployeeTaskScore } from '../types/taskScore';

interface TooltipPayloadItem {
  value: number;
  payload: EmployeeTaskScore;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      <strong>{entry.year}</strong>: {entry.totalPoints} points ({entry.completedTaskCount} completed task
      {entry.completedTaskCount === 1 ? '' : 's'})
    </div>
  );
}

/** Year-by-year total points — sum of `points` across every project, for tasks completed that year. */
export function PointsHistoryChart({ history }: { history: EmployeeTaskScore[] }) {
  if (history.length === 0) {
    return <div style={{ color: '#999' }}>No completed tasks yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={history} margin={{ top: 8, left: 8, right: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="totalPoints" fill="#13a8a8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
