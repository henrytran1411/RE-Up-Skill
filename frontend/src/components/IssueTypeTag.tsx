import { Tag } from 'antd';

const ISSUE_TYPE_COLOR: Record<string, string> = {
  Bug: 'red',
  Task: 'blue',
  Story: 'green',
  Epic: 'purple',
  'Sub-task': 'default',
};

export function IssueTypeTag({ issueType }: { readonly issueType: string | null }) {
  if (!issueType) return <span style={{ color: '#999' }}>—</span>;
  return <Tag color={ISSUE_TYPE_COLOR[issueType] ?? 'default'}>{issueType}</Tag>;
}
