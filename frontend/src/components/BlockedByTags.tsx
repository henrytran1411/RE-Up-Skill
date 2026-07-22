import { Tag, Tooltip, Space } from 'antd';
import { BlockedByIssueRef } from '../types/evaluation';

export function BlockedByTags({ blockedByIssues }: { readonly blockedByIssues: BlockedByIssueRef[] }) {
  if (!blockedByIssues || blockedByIssues.length === 0) {
    return <span style={{ color: '#999' }}>—</span>;
  }
  return (
    <Space size={4} wrap>
      {blockedByIssues.map((issue) => (
        <Tooltip key={issue.key} title={`${issue.issueType ?? 'Issue'}: ${issue.summary ?? issue.key}`}>
          <Tag color="red">{issue.key}</Tag>
        </Tooltip>
      ))}
    </Space>
  );
}
