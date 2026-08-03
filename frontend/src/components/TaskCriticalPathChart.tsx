import { useState } from 'react';
import { Bar, ComposedChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CriticalPathBlocker, CriticalPathTaskNode, NonCriticalEpicGroup } from '../types/projectHealth';
import { TaskDetailModal } from './TaskDetailModal';

interface ChartRow {
  label: string;
  kind: 'critical' | 'epic';
  /** Set only on 'critical' rows — this task's own points, plotted as the critical-path line. */
  linePoints?: number;
  completed?: boolean;
  epicName?: string | null;
  /** Set only on 'critical' rows — every task blocking this one (can be more than one; only the longest chain among them is what put this task on the critical path). */
  blockers?: CriticalPathBlocker[];
  blockersTotalChainPoints?: number;
  /** Set only on 'critical' rows — the full node, handed back on click to open the detail modal. */
  node?: CriticalPathTaskNode;
  /** Set only on 'epic' rows — total estimate hours of that Epic's non-critical-path tasks, plotted as bars. */
  estimateHours?: number;
  taskCount?: number;
}

interface DotProps {
  readonly cx?: number;
  readonly cy?: number;
  readonly payload?: ChartRow;
  readonly onSelect?: (node: CriticalPathTaskNode) => void;
}

/** Green dot for a completed critical-path task, grey hollow for one still pending — clickable to open its detail. */
function CriticalPathDot({ cx, cy, payload, onSelect }: DotProps) {
  if (cx === undefined || cy === undefined || !payload || payload.kind !== 'critical') {
    return <svg />;
  }
  const completed = payload.completed;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={6}
      fill={completed ? '#52c41a' : '#fff'}
      stroke={completed ? '#52c41a' : '#1890ff'}
      strokeWidth={2}
      style={{ cursor: payload.node ? 'pointer' : 'default' }}
      onClick={() => payload.node && onSelect?.(payload.node)}
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
          {row.blockers && row.blockers.length > 1 && (
            <div style={{ marginTop: 4, borderTop: '1px solid #eee', paddingTop: 4 }}>
              <div>Blocked by {row.blockers.length} tasks:</div>
              <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>
                {row.blockers.map((b) => (
                  <li key={b.id}>
                    {b.taskCode ?? b.taskName} — {b.chainPoints} pts
                    {b.chainPoints !== b.points ? ` (${b.points} own + its own chain)` : ''}
                  </li>
                ))}
              </ul>
              <div style={{ color: '#999' }}>Total across branches: {row.blockersTotalChainPoints} pts</div>
            </div>
          )}
          <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Click for details</div>
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
 * Critical-path task sequence as a line (dot color marks completion, click a
 * dot for that task's detail), plus tasks NOT on the critical path grouped
 * by Epic as bars showing their total estimate hours. Two logically
 * separate series sharing one categorical X-axis — the line gap between the
 * last critical-path point and the first Epic-group bar is expected, not a
 * bug.
 */
export function TaskCriticalPathChart({
  criticalPath,
  nonCriticalByEpic,
}: {
  readonly criticalPath: CriticalPathTaskNode[];
  readonly nonCriticalByEpic: NonCriticalEpicGroup[];
}) {
  const [selectedNode, setSelectedNode] = useState<CriticalPathTaskNode | null>(null);

  if (criticalPath.length === 0 && nonCriticalByEpic.length === 0) {
    return <div style={{ color: '#999' }}>No tasks yet.</div>;
  }

  // Recharts' chart-level click fires on the whole plotting area, resolving the nearest x-axis category the
  // same way hover-for-tooltip already does — far more forgiving than requiring a precise hit on a 6px dot.
  const handleChartClick = (state: { activePayload?: { payload: ChartRow }[] }) => {
    const row = state?.activePayload?.[0]?.payload;
    if (row?.kind === 'critical' && row.node) {
      setSelectedNode(row.node);
    }
  };

  const data: ChartRow[] = [
    ...criticalPath.map((t) => ({
      label: t.taskCode ?? t.taskName,
      kind: 'critical' as const,
      linePoints: t.points,
      completed: t.completedAt !== null,
      epicName: t.epicName,
      blockers: t.blockers,
      blockersTotalChainPoints: t.blockersTotalChainPoints,
      node: t,
    })),
    ...nonCriticalByEpic.map((e) => ({
      label: e.epicName,
      kind: 'epic' as const,
      estimateHours: e.totalEstimateHours,
      taskCount: e.taskCount,
    })),
  ];

  return (
    <>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={data}
          margin={{ top: 8, left: 8, right: 8, bottom: 40 }}
          onClick={handleChartClick}
          style={{ cursor: 'pointer' }}
        >
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
            dot={<CriticalPathDot onSelect={setSelectedNode} />}
            connectNulls={false}
          />
          <Bar yAxisId="hours" dataKey="estimateHours" name="Non-critical estimate hrs (by Epic)" fill="#fa8c16" />
        </ComposedChart>
      </ResponsiveContainer>
      <TaskDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
    </>
  );
}
