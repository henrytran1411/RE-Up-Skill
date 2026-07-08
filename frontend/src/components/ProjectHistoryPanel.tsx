import { Card, Progress, Table, Space, Typography } from 'antd';
import { ProjectHistoryEntry } from '../types/evaluation';

export function ProjectHistoryPanel({ projects }: { projects: ProjectHistoryEntry[] }) {
  if (projects.length === 0) {
    return <div style={{ color: '#999' }}>No project history yet.</div>;
  }

  const sorted = [...projects].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      {sorted.map((project) => (
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
            pagination={false}
            dataSource={project.tasks}
            columns={[
              { title: 'Task', dataIndex: 'taskName' },
              { title: 'Points', dataIndex: 'points' },
              { title: 'Complexity', dataIndex: 'complexity' },
              { title: 'Est. hrs', dataIndex: 'estimateHours' },
              {
                title: 'Actual hrs',
                dataIndex: 'actualHours',
                render: (v: number | null) => v ?? '—',
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
    </Space>
  );
}
