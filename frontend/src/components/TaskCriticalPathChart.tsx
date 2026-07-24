import { Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CriticalPathTaskNode, NonCriticalEpicGroup } from '../types/projectHealth';

interface ChartRow {
  label: string;
  kind: 'critical' | 'epic';
  /** Set only on 'critical' rows — this task's own points, plotted as the critical-path line. */
  linePoints?: number;
  completed?: boolean;
  epicName?: string | null;
  /** Set only on 'epic' rows — total estimate hours of that Epic's non-critical-path tasks, plotted as bars. */
  estimateHours?: number;
  taskCount?: number;
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: ChartRow;
}

/** Green dot for a completed critical-path task, grey hollow for one still pending. */
function CriticalPathDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.kind !== 'critical') {
    return <svg />;
  }
  const completed = payload.completed;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={completed ? '#52c41a' : '#fff'}
      stroke={completed ? '#52c41a' : '#1890ff'}
      strokeWidth={2}
    />
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }
  const row = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
      <strong>{row.label}</strong>
      {row.kind === 'critical' ? (
        <>
          <div style={{ color: row.completed ? '#52c41a' : '#1890ff' }}>
            {row.completed ? 'Completed' : 'Not completed'} — {row.linePoints} pts
          </div>
          {row.epicName && <div style={{ color: '#999' }}>Epic: {row.epicName}</div>}
        </>
      ) : (
        <div style={{ color: '#fa8c16' }}>
          {row.estimateHours}h estimate across {row.taskCount} non-critical task(s)
        </div>
      )}
    </div>
  );
}

/**
 * Critical-path task sequence as a line (dot color marks completion), plus
 * tasks NOT on the critical path grouped by Epic as bars showing their total
 * estimate hours. Two logically separate series sharing one categorical
 * X-axis — the line gap between the last critical-path point and the first
 * Epic-group bar is expected, not a bug.
 */
export function TaskCriticalPathChart({
  criticalPath,
  nonCriticalByEpic,
}: {
  readonly criticalPath: CriticalPathTaskNode[];
  readonly nonCriticalByEpic: NonCriticalEpicGroup[];
}) {
  if (criticalPath.length === 0 && nonCriticalByEpic.length === 0) {
    return <div style={{ color: '#999' }}>No tasks yet.</div>;
  }

  const data: ChartRow[] = [
    ...criticalPath.map((t) => ({
      label: t.taskCode ?? t.taskName,
      kind: 'critical' as const,
      linePoints: t.points,
      completed: t.completedAt !== null,
      epicName: t.epicName,
    })),
    ...nonCriticalByEpic.map((e) => ({
      label: e.epicName,
      kind: 'epic' as const,
      estimateHours: e.totalEstimateHours,
      taskCount: e.taskCount,
    })),
  ];

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, left: 8, right: 8, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="label" angle={-30} textAnchor="end" interval={0} height={60} />
        <YAxis yAxisId="points" label={{ value: 'Points', angle: -90, position: 'insideLeft' }} />
        <YAxis
          yAxisId="hours"
          orientation="right"
          label={{ value: 'Estimate hrs', angle: 90, position: 'insideRight' }}
        />
        <Tooltip content={<ChartTooltip />} />
        <Legend />
        <Line
          yAxisId="points"
          type="monotone"
          dataKey="linePoints"
          name="Critical path (points)"
          stroke="#1890ff"
          strokeWidth={2}
          dot={<CriticalPathDot />}
          connectNulls={false}
        />
        <Bar yAxisId="hours" dataKey="estimateHours" name="Non-critical estimate hrs (by Epic)" fill="#fa8c16" />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
