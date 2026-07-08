import { Employee, LevelHistoryEntry } from '../types/employee';
import { GanttChart, GanttRow } from './GanttChart';

/**
 * Org-wide overview: one row per employee, segments show each employee's
 * overall Junior -> Middle -> Senior journey on a shared calendar timeline.
 * Employees with no recorded level history (accounts created before this
 * ledger existed) are omitted rather than shown as an empty row.
 */
export function EmployeeLevelOverviewChart({
  employees,
  historyByEmployeeId,
}: {
  employees: Employee[];
  historyByEmployeeId: Map<string, LevelHistoryEntry[]>;
}) {
  const rows: GanttRow[] = employees
    .map((employee) => ({
      name: employee.fullName,
      segments: (historyByEmployeeId.get(employee.id) ?? []).map((entry) => ({
        level: entry.level ?? 'Unknown',
        startDate: entry.startDate,
        endDate: entry.endDate,
        durationDays: entry.durationDays,
      })),
    }))
    .filter((row) => row.segments.length > 0);

  if (rows.length === 0) {
    return <div style={{ color: '#999' }}>No level history recorded for any employee yet.</div>;
  }

  return <GanttChart rows={rows} yAxisWidth={120} />;
}
