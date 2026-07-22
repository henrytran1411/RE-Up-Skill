import { Card, Pagination, Progress, Table, Space, Typography } from 'antd';
import { useState } from 'react';
import { ProjectHistoryEntry, BlockedByIssueRef } from '../types/evaluation';
import { IssueTypeTag } from './IssueTypeTag';
import { BlockedByTags } from './BlockedByTags';

const PROJECTS_PER_PAGE = 5;
const TASKS_PER_PAGE = 10;

export function ProjectHistoryPanel({ projects }: { projects: ProjectHistoryEntry[] }) {
  const [page, setPage] = useState(1);

  if (projects.length === 0) {
    return <div style={{ color: '#999' }}>No project history yet.</div>;
  }

  const sorted = [...projects].sort((a, b) => b.startDate.localeCompare(a.startDate));
  const pageStart = (page - 1) * PROJECTS_PER_PAGE;
  const pageItems = sorted.slice(pageStart, pageStart + PROJECTS_PER_PAGE);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {pageItems.map((project) => (
        <Card
          key={project.projectName}
          size="small"
          title={project.projectName}
          extra={
            <Typography.Text style={{ fontSize: 12 }} type="secondary">
              {project.startDate} → {project.endDate ?? 'ongoing'}
            </Typography.Text>
          }
        >
          <Space align="center" size="large" style={{ marginBottom: 12 }}>
            <Progress type="circle" percent={project.effortPercent} size={72} />
            <div>
              <Typography.Text strong>{project.employeePoints}</Typography.Text> of{' '}
              <Typography.Text strong>{project.totalProjectPoints}</Typography.Text> total project points
              <div style={{ color: '#999', fontSize: 12 }}>effort share vs. every contributor on this project</div>
            </div>
          </Space>
          <Table
            rowKey="id"
            size="small"
            pagination={
              project.tasks.length > TASKS_PER_PAGE ? { pageSize: TASKS_PER_PAGE, size: 'small' } : false
            }
            dataSource={project.tasks}
            columns={[
              { title: 'Task', dataIndex: 'taskName' },
              {
                title: 'Type',
                dataIndex: 'issueType',
                render: (v: string | null) => <IssueTypeTag issueType={v} />,
              },
              { title: 'Points', dataIndex: 'points' },
              { title: 'Complexity', dataIndex: 'complexity' },
              { title: 'Est. hrs', dataIndex: 'estimateHours' },
              {
                title: 'Actual hrs',
                dataIndex: 'actualHours',
                render: (v: number | null) => v ?? '—',
              },
              {
                title: 'Blocked By',
                dataIndex: 'blockedByIssues',
                render: (v: BlockedByIssueRef[]) => <BlockedByTags blockedByIssues={v} />,
              },
              {
                title: 'Status',
                dataIndex: 'completedAt',
                render: (v: string | null) => (v ? `Completed ${v}` : 'In progress'),
              },
            ]}
          />
        </Card>
      ))}

      {sorted.length > PROJECTS_PER_PAGE && (
        <div style={{ textAlign: 'center' }}>
          <Pagination
            current={page}
            pageSize={PROJECTS_PER_PAGE}
            total={sorted.length}
            onChange={setPage}
            showSizeChanger={false}
          />
        </div>
      )}
    </Space>
  );
}
