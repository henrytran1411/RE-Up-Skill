import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ProjectContributor } from '../types/project';

function formatMoney(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * How much value each contributor added to the project: their share of
 * revenue (by effort) versus what that netted after their cost. Contributors
 * with no rate on file (netContribution === null) are excluded — there's no
 * net value to chart without a cost basis, though their revenue share alone
 * still shows how much of the work they carried.
 */
export function ProjectContributionChart({ contributors }: { readonly contributors: ProjectContributor[] }) {
  if (contributors.length === 0) {
    return <div style={{ color: '#999' }}>No contributors to chart yet.</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, contributors.length * 60)}>
      <BarChart data={contributors} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis type="category" dataKey="employeeName" width={110} />
        <Tooltip formatter={(value: number) => formatMoney(value)} />
        <Legend />
        <Bar dataKey="revenueShare" name="Revenue share" fill="#1677ff" />
        <Bar dataKey="netContribution" name="Net contribution" fill="#52c41a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
