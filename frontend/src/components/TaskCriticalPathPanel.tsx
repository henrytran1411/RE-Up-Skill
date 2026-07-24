import { Space, Statistic, Row, Col, Tag, Table, Progress, Alert } from 'antd';
import { TaskCriticalPathChart } from './TaskCriticalPathChart';
import { CriticalPathTaskNode, TaskCriticalPathReport } from '../types/projectHealth';

/** Task-level critical path report: percent-done stats, the combined chart, and the ordered task sequence. */
export function TaskCriticalPathPanel({ report }: { readonly report: TaskCriticalPathReport }) {
  if (report.criticalPath.length === 0) {
    return <Alert type="info" showIcon message="No leaf tasks found for this project yet." />;
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Row gutter={16}>
        <Col span={8}>
          <Statistic
            title="Critical Path % Done"
            value={report.criticalPathPercentDone}
            suffix="%"
          />
          <Progress percent={report.criticalPathPercentDone} size="small" />
          <div style={{ color: '#999', fontSize: 12 }}>
            {report.criticalPathCompletedPoints} / {report.criticalPathTotalPoints} pts
          </div>
        </Col>
        <Col span={8}>
          <Statistic title="All Tasks % Done" value={report.allTasksPercentDone} suffix="%" />
          <Progress percent={report.allTasksPercentDone} size="small" />
          <div style={{ color: '#999', fontSize: 12 }}>
            {report.allTasksCompletedPoints} / {report.allTasksTotalPoints} pts
          </div>
        </Col>
        <Col span={8}>
          <Statistic title="Tasks On Critical Path" value={report.criticalPath.length} />
        </Col>
      </Row>

      <TaskCriticalPathChart criticalPath={report.criticalPath} nonCriticalByEpic={report.nonCriticalByEpic} />

      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={report.criticalPath}
        columns={[
          {
            title: 'Order',
            render: (_, __: CriticalPathTaskNode, index: number) => index + 1,
          },
          {
            title: 'Task',
            render: (_, t: CriticalPathTaskNode) => (
              <Space>
                <Tag color="red">Critical Path</Tag>
                {t.taskCode ?? t.taskName}
              </Space>
            ),
          },
          { title: 'Epic', render: (_, t: CriticalPathTaskNode) => t.epicName ?? '—' },
          { title: 'Points', dataIndex: 'points' },
          {
            title: 'Status',
            render: (_, t: CriticalPathTaskNode) =>
              t.completedAt ? <Tag color="green">Completed {t.completedAt}</Tag> : <Tag>Not completed</Tag>,
          },
        ]}
      />

      <div style={{ color: '#999', fontSize: 12 }}>
        Critical path: {report.criticalPath.map((t) => t.taskCode ?? t.taskName).join(' → ')}
      </div>

      {report.nonCriticalByEpic.length > 0 && (
        <Table
          rowKey="epicName"
          size="small"
          pagination={false}
          title={() => 'Non-critical tasks, grouped by Epic'}
          dataSource={report.nonCriticalByEpic}
          columns={[
            { title: 'Epic', dataIndex: 'epicName' },
            { title: 'Task Count', dataIndex: 'taskCount' },
            { title: 'Total Estimate hrs', dataIndex: 'totalEstimateHours' },
          ]}
        />
      )}
    </Space>
  );
}
