import { Timeline, Typography } from 'antd';
import { EmployeeSkill } from '../types/skill';
import { SkillStatusTag } from './SkillStatusTag';

function formatDuration(days: number): string {
  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  if (years > 0) {
    return months > 0 ? `${years}y ${months}m` : `${years}y`;
  }
  return `${months} month${months === 1 ? '' : 's'}`;
}

/** Chronological Junior -> Middle -> Senior progression for one employee's one skill. */
export function SkillLevelTimeline({ entries }: { entries: EmployeeSkill[] }) {
  if (entries.length === 0) {
    return <div style={{ color: '#999' }}>No history recorded for this skill yet.</div>;
  }

  const sorted = [...entries].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <Timeline
      items={sorted.map((entry) => ({
        color: entry.endDate ? 'gray' : 'blue',
        children: (
          <div key={entry.id}>
            <Typography.Text strong style={{ textTransform: 'capitalize' }}>
              {entry.level ?? entry.track}
            </Typography.Text>{' '}
            <SkillStatusTag status={entry.status} />
            <div style={{ color: '#666' }}>
              {entry.startDate} → {entry.endDate ?? 'ongoing'}
            </div>
            <div>
              <strong>{formatDuration(entry.durationDays)}</strong>
              {!entry.endDate && ' so far'}
            </div>
          </div>
        ),
      }))}
    />
  );
}
