import { Alert, Space, Statistic, Row, Col, Tag, Table } from 'antd';
import { SprintBurndownChart } from './SprintBurndownChart';
import { ProjectHealthReport, ProjectHealthStatus, EpicHealth } from '../types/projectHealth';

const STATUS_TAG: Record<ProjectHealthStatus, { color: string; label: string }> = {
  good: { color: 'success', label: 'On Track' },
  normal: { color: 'warning', label: 'At Risk' },
  bad: { color: 'error', label: 'Behind Schedule' },
};

function statusMessage(report: ProjectHealthReport): string {
  if (!report.targetEndDate) {
    return 'No target end date set — set one in Project settings below to get a projected-finish comparison.';
  }
  if (report.daysLate === null || report.daysLate <= 0) {
    return `Critical path is projected to finish ${report.projectedFinishDate} — on or before the ${report.targetEndDate} target.`;
  }
  return `Critical path is projected to finish ${report.projectedFinishDate}, ${report.daysLate} day(s) after the ${report.targetEndDate} target.`;
}

export function ProjectHealthPanel({ report }: { readonly report: ProjectHealthReport }) {
  const { color, label } = STATUS_TAG[report.status];
  const criticalPathEpics = report.criticalPath
    .map((key) => report.epics.find((e) => e.key === key))
    .filter((e): e is EpicHealth => e !== undefined);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Alert
        type={report.status === 'good' ? 'success' : report.status === 'normal' ? 'warning' : 'error'}
        showIcon
        message={
          <Space>
            <Tag color={color}>{label}</Tag>
            {statusMessage(report)}
          </Space>
        }
      />

      <Row gutter={16}>
        <Col span={6}>
          <Statistic title="Sprints Elapsed" value={report.sprintsElapsed} />
        </Col>
        <Col span={6}>
          <Statistic title="Velocity (pts/sprint)" value={report.velocityPointsPerSprint} />
        </Col>
        <Col span={6}>
          <Statistic title="Critical Path Sprints Left" value={report.criticalPathAdditionalSprints} />
        </Col>
        <Col span={6}>
          <Statistic title="Projected Finish" value={report.projectedFinishDate ?? '—'} />
        </Col>
      </Row>

      <SprintBurndownChart sprints={report.sprints} />

      {report.epics.length > 0 && (
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          dataSource={report.epics}
          columns={[
            {
              title: 'Epic',
              render: (_, epic: EpicHealth) => (
                <Space>
                  {epic.isOnCriticalPath && <Tag color="red">Critical Path</Tag>}
                  {epic.name} ({epic.key})
                </Space>
              ),
            },
            { title: 'Total Pts', dataIndex: 'totalPoints' },
            { title: 'Remaining Pts', dataIndex: 'remainingPoints' },
            { title: 'Sprints Needed', dataIndex: 'estimatedSprintsNeeded' },
            {
              title: 'Blocked By',
              render: (_, epic: EpicHealth) =>
                epic.blockedByEpicKeys.length > 0 ? epic.blockedByEpicKeys.join(', ') : '—',
            },
          ]}
        />
      )}

      {criticalPathEpics.length > 0 && (
        <div style={{ color: '#999', fontSize: 12 }}>
          Critical path: {criticalPathEpics.map((e) => `${e.name} (${e.key})`).join(' → ')}
        </div>
      )}
    </Space>
  );
}
