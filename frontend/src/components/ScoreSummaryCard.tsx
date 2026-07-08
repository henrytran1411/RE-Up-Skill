import { Card, Progress, Statistic, Row, Col } from 'antd';
import { Evaluation } from '../types/evaluation';

interface ScoreSummaryCardProps {
  evaluation: Evaluation | null;
}

export function ScoreSummaryCard({ evaluation }: ScoreSummaryCardProps) {
  if (!evaluation) {
    return (
      <Card title="Latest Performance Score">
        <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>
          No evaluation on record yet.
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Latest Performance Score — ${evaluation.period} (${evaluation.periodStart} to ${evaluation.periodEnd})`}>
      <Row gutter={24} align="middle">
        <Col span={8}>
          <Progress
            type="dashboard"
            percent={Math.round(evaluation.totalScore)}
            format={(percent) => `${percent}`}
          />
        </Col>
        <Col span={16}>
          <Row gutter={16}>
            <Col span={12}>
              <Statistic title="Task Score" value={evaluation.taskScore.toFixed(1)} />
            </Col>
            <Col span={12}>
              <Statistic title="Skill Score" value={evaluation.skillScore.toFixed(1)} />
            </Col>
            <Col span={12}>
              <Statistic title="Soft Skill Score" value={evaluation.softSkillScore.toFixed(1)} />
            </Col>
            <Col span={12}>
              <Statistic title="Bench Score" value={evaluation.benchScore.toFixed(1)} />
            </Col>
          </Row>
        </Col>
      </Row>
    </Card>
  );
}
