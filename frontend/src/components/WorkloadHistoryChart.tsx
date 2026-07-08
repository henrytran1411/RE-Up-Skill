import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
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
      <strong>{entry.year}</strong> ({entry.completedTaskCount} task{entry.completedTaskCount === 1 ? '' : 's'})
      <div style={{ color: '#fa8c16' }}>Estimate: {entry.workloadPercent}% ({entry.estimatedHours}h)</div>
      <div style={{ color: '#1890ff' }}>Actual: {entry.actualWorkloadPercent}% ({entry.actualHours}h)</div>
    </div>
  );
}

/**
 * Year-by-year workload — estimated vs. actual hours worked, each as a percent
 * of a full year's capacity (22 workdays x 8h x 12 months, minus 20 days x 8h leave).
 */
export function WorkloadHistoryChart({ history }: { history: EmployeeTaskScore[] }) {
  if (history.length === 0) {
    return <div style={{ color: '#999' }}>No completed tasks yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={history} margin={{ top: 8, left: 8, right: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="year" />
        <YAxis unit="%" />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        <ReferenceLine y={100} stroke="#f5222d" strokeDasharray="4 4" label={{ value: 'Full capacity', position: 'insideTopRight', fill: '#f5222d', fontSize: 12 }} />
        <Bar dataKey="workloadPercent" name="Estimate hours %" fill="#fa8c16" />
        <Bar dataKey="actualWorkloadPercent" name="Actual hours %" fill="#1890ff" />
      </BarChart>
    </ResponsiveContainer>
  );
}
