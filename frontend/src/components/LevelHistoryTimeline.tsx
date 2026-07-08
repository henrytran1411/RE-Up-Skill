import { Timeline, Tag, Typography } from 'antd';
import { LevelHistoryEntry } from '../types/employee';
import { LevelHistorySource } from '../types/common';

const SOURCE_LABEL: Record<LevelHistorySource, string> = {
  [LevelHistorySource.INITIAL]: 'Initial',
  [LevelHistorySource.AUTO_PROMOTION]: 'Auto-promoted',
  [LevelHistorySource.MANUAL]: 'Manual change',
};

const SOURCE_COLOR: Record<LevelHistorySource, string> = {
  [LevelHistorySource.INITIAL]: 'default',
  [LevelHistorySource.AUTO_PROMOTION]: 'green',
  [LevelHistorySource.MANUAL]: 'purple',
};

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

export function LevelHistoryTimeline({ entries }: { entries: LevelHistoryEntry[] }) {
  if (entries.length === 0) {
    return <div style={{ color: '#999' }}>No level history recorded yet.</div>;
  }

  return (
    <Timeline
      items={entries.map((entry) => ({
        color: entry.endDate ? 'gray' : 'blue',
        children: (
          <div key={entry.id}>
            <Typography.Text strong style={{ textTransform: 'capitalize' }}>
              {entry.level}
            </Typography.Text>{' '}
            <Tag color={SOURCE_COLOR[entry.source]}>{SOURCE_LABEL[entry.source]}</Tag>
            <div style={{ color: '#666' }}>
              {entry.startDate} → {entry.endDate ?? 'present'}
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
