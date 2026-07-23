import { Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { SprintBurn } from '../types/projectHealth';

interface TooltipPayloadItem {
  value: number;
  payload: SprintBurn;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const entry = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      <strong>Sprint {entry.sprintNumber}</strong>
      <div style={{ color: '#fa8c16' }}>Estimated: {entry.estimatedPoints} pts</div>
      <div style={{ color: '#1890ff' }}>Burned: {entry.burnedPoints} pts</div>
    </div>
  );
}

/** Points estimated vs. burned per 2-week sprint — the project's burnup history. */
export function SprintBurndownChart({ sprints }: { readonly sprints: SprintBurn[] }) {
  if (sprints.length === 0) {
    return <div style={{ color: '#999' }}>No sprint data yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={sprints} margin={{ top: 8, left: 8, right: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="sprintNumber" label={{ value: 'Sprint', position: 'insideBottom', offset: -5 }} />
        <YAxis />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        <Bar dataKey="estimatedPoints" name="Estimated" fill="#fa8c16" />
        <Line type="monotone" dataKey="burnedPoints" name="Burned" stroke="#1890ff" strokeWidth={2} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
