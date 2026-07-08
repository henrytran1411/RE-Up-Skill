import { HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CertificateHistoryChart } from '../../components/CertificateHistoryChart';
import { ContributionHistoryChart } from '../../components/ContributionHistoryChart';
import { EmployeeWorkStatusTag } from '../../components/EmployeeWorkStatusTag';
import { LevelHistoryChart } from '../../components/LevelHistoryChart';
import { LevelHistoryTimeline } from '../../components/LevelHistoryTimeline';
import { ScoreSummaryCard } from '../../components/ScoreSummaryCard';
import { SkillSuggestionsPanel } from '../../components/SkillSuggestionsPanel';
import { createBenchLog, fetchMyBenchLogs, fetchMyIdleLearningAlert } from '../../services/benchService';
import { fetchMyCertificateYearlySummary } from '../../services/certificateService';
import { fetchMyContributionYearlySummary } from '../../services/contributionService';
import { fetchMyLevelHistory, fetchMyProfile } from '../../services/employeeService';
import { fetchMyEvaluations } from '../../services/evaluationService';
import { fetchMySkillSuggestions } from '../../services/skillSuggestionService';
import { fetchMyTechnicalPoint } from '../../services/technicalPointService';
import { BenchLog, IdleLearningAlert } from '../../types/bench';
import { CertificateYearSummary } from '../../types/certificate';
import { BenchActivityType } from '../../types/common';
import { ContributionYearSummary } from '../../types/contribution';
import { Employee, LevelHistoryEntry } from '../../types/employee';
import { Evaluation } from '../../types/evaluation';
import { SkillGapSuggestion } from '../../types/skillSuggestion';
import { TechnicalPointBreakdown } from '../../types/technicalPoint';

export function DevDashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Employee | null>(null);
  const [idleLearningAlert, setIdleLearningAlert] = useState<IdleLearningAlert | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [benchLogs, setBenchLogs] = useState<BenchLog[]>([]);
  const [technicalPoint, setTechnicalPoint] = useState<TechnicalPointBreakdown | null>(null);
  const [skillSuggestions, setSkillSuggestions] = useState<SkillGapSuggestion[]>([]);
  const [contributionSummary, setContributionSummary] = useState<ContributionYearSummary[]>([]);
  const [certificateSummary, setCertificateSummary] = useState<CertificateYearSummary[]>([]);
  const [benchModalOpen, setBenchModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [levelHistory, setLevelHistory] = useState<LevelHistoryEntry[]>([]);
  const [benchForm] = Form.useForm();

  const loadData = async () => {
    const [me, myEvaluations, myBenchLogs, technical, suggestions, contribution, certificates, idleAlert] =
      await Promise.all([
        fetchMyProfile(),
        fetchMyEvaluations(),
        fetchMyBenchLogs(),
        fetchMyTechnicalPoint(),
        fetchMySkillSuggestions(),
        fetchMyContributionYearlySummary(),
        fetchMyCertificateYearlySummary(),
        fetchMyIdleLearningAlert(),
      ]);
    setProfile(me);
    setEvaluations(myEvaluations);
    setBenchLogs(myBenchLogs);
    setTechnicalPoint(technical);
    setSkillSuggestions(suggestions);
    setContributionSummary(contribution);
    setCertificateSummary(certificates);
    setIdleLearningAlert(idleAlert);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openHistoryModal = async () => {
    setHistoryModalOpen(true);
    setLevelHistory(await fetchMyLevelHistory());
  };

  const handleLogBench = async () => {
    const values = await benchForm.validateFields();
    await createBenchLog({
      ...values,
      startDate: values.startDate.format('YYYY-MM-DD'),
      endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
    });
    message.success('Bench activity logged');
    setBenchModalOpen(false);
    benchForm.resetFields();
    loadData();
  };

  return (
    <div>
      {idleLearningAlert && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
          message="You've been idle for a while"
          description={`You haven't been on a project for ${idleLearningAlert.daysIdle} days and haven't started learning anything new in that time. Consider declaring a skill you're studying.`}
          action={
            <Button size="small" type="primary" onClick={() => navigate('/my-skills')}>
              Start learning
            </Button>
          }
        />
      )}

      <Row gutter={[24, 24]}>
        {profile && (
          <Col span={24}>
            <Card size="small">
              <Space size="large">
                <Typography.Text>
                  Overall level: <strong>{profile.level}</strong>
                </Typography.Text>
                <Typography.Text>
                  Technical Point: <strong>{technicalPoint?.totalPoints ?? 0}</strong>
                </Typography.Text>
                <EmployeeWorkStatusTag status={profile.status} />
                {profile.currentProject && (
                  <Typography.Text type="secondary">Project: {profile.currentProject}</Typography.Text>
                )}
                <Button size="small" icon={<HistoryOutlined />} onClick={openHistoryModal}>
                  View level history
                </Button>
              </Space>
            </Card>
          </Col>
        )}

        <Col span={24}>
          <ScoreSummaryCard evaluation={evaluations[0] ?? null} />
        </Col>

        <Col span={24}>
          <Card title="Contribution, Performance & Task Completion by Year">
            <ContributionHistoryChart summaries={contributionSummary} />
          </Card>
        </Col>

        <Col span={24}>
          <Card title="Certificate Points by Year">
            <CertificateHistoryChart summaries={certificateSummary} />
          </Card>
        </Col>

        <Col span={24}>
          <Card title="Suggested Learning">
            <SkillSuggestionsPanel suggestions={skillSuggestions} onAdded={loadData} />
          </Card>
        </Col>

        <Col span={24}>
          <Card
            title="Bench Time Log"
            extra={<Button icon={<PlusOutlined />} onClick={() => setBenchModalOpen(true)}>Log bench activity</Button>}
          >
            {benchLogs.map((log) => (
              <div key={log.id} style={{ marginBottom: 8 }}>
                <strong>{log.startDate}</strong> — {log.activityType} — {log.description}{' '}
                {log.isReviewed && <span>score: {log.outcomeScore}/5</span>}
              </div>
            ))}
            {benchLogs.length === 0 && <div style={{ color: '#999' }}>No bench activity logged.</div>}
          </Card>
        </Col>
      </Row>

      <Modal
        title="Log bench activity"
        open={benchModalOpen}
        onOk={handleLogBench}
        onCancel={() => setBenchModalOpen(false)}
      >
        <Form form={benchForm} layout="vertical">
          <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="endDate" label="End date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="activityType" label="Activity type" rules={[{ required: true }]}>
            <Select
              options={Object.values(BenchActivityType).map((v) => ({ value: v, label: v }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="My level history" open={historyModalOpen} onCancel={() => setHistoryModalOpen(false)} footer={null}>
        <LevelHistoryChart entries={levelHistory} />
        <LevelHistoryTimeline entries={levelHistory} />
      </Modal>
    </div>
  );
}
