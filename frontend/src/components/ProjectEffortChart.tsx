import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { PublicProjectContributor } from '../types/project';

/**
 * Compares each contributor's effort share on a project three ways: by
 * assigned story points, by estimated hours, and by actual hours logged so
 * far. The three can diverge meaningfully — e.g. someone whose tasks ran
 * over estimate will show a higher "actual" share than their "points" share.
 */
export function ProjectEffortChart({ contributors }: { contributors: PublicProjectContributor[] }) {
  if (contributors.length === 0) {
    return <div style={{ color: '#999' }}>No contributors to chart yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, contributors.length * 60)}>
      <BarChart data={contributors} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" unit="%" domain={[0, 100]} />
        <YAxis type="category" dataKey="employeeName" width={110} />
        <Tooltip formatter={(value: number) => `${value}%`} />
        <Legend />
        <Bar dataKey="pointsEffortPercent" name="By points" fill="#1677ff" />
        <Bar dataKey="estimateEffortPercent" name="By estimate hrs" fill="#faad14" />
        <Bar dataKey="actualEffortPercent" name="By actual hrs" fill="#52c41a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
