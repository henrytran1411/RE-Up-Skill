import { Card, Col, Row } from 'antd';
import { useEffect, useState } from 'react';
import { PointsHistoryChart } from '../../components/PointsHistoryChart';
import { ProjectHistoryPanel } from '../../components/ProjectHistoryPanel';
import { WorkloadHistoryChart } from '../../components/WorkloadHistoryChart';
import { fetchMyProjectHistory } from '../../services/evaluationService';
import { fetchMyTaskScoreHistory } from '../../services/taskScoreService';
import { ProjectHistoryEntry } from '../../types/evaluation';
import { EmployeeTaskScore } from '../../types/taskScore';

export function MyProjectsPage() {
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryEntry[]>([]);
  const [taskScoreHistory, setTaskScoreHistory] = useState<EmployeeTaskScore[]>([]);

  useEffect(() => {
    fetchMyProjectHistory().then(setProjectHistory);
    fetchMyTaskScoreHistory().then(setTaskScoreHistory);
  }, []);

  return (
    <Row gutter={[24, 24]}>
      <Col span={24}>
        <Card title="My Project History">
          <ProjectHistoryPanel projects={projectHistory} />
        </Card>
      </Col>

      <Col span={24}>
        <Card title="My Points by Year">
          <PointsHistoryChart history={taskScoreHistory} />
        </Card>
      </Col>

      <Col span={24}>
        <Card title="My Workload by Year">
          <WorkloadHistoryChart history={taskScoreHistory} />
        </Card>
      </Col>
    </Row>
  );
}
