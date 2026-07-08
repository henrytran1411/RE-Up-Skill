import { useEffect, useState } from 'react';
import { Row, Col, Card, Table, Tag, Alert, Space, Button, message } from 'antd';
import { fetchAllEmployees } from '../../services/employeeService';
import { fetchIdleBenchAlerts } from '../../services/benchService';
import { fetchPendingSkillReviews, verifyEmployeeSkill, confirmEmployeeSkill } from '../../services/skillService';
import { fetchAllTechnicalPoints } from '../../services/technicalPointService';
import { SkillStatusTag } from '../../components/SkillStatusTag';
import { EmployeeWorkStatusTag } from '../../components/EmployeeWorkStatusTag';
import { Employee } from '../../types/employee';
import { IdleBenchAlert } from '../../types/bench';
import { EmployeeSkill } from '../../types/skill';
import { TechnicalPointBreakdown } from '../../types/technicalPoint';
import { SkillStatus } from '../../types/common';

export function PmDashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [idleAlerts, setIdleAlerts] = useState<IdleBenchAlert[]>([]);
  const [pendingSkills, setPendingSkills] = useState<EmployeeSkill[]>([]);
  const [technicalPoints, setTechnicalPoints] = useState<TechnicalPointBreakdown[]>([]);

  const loadPendingSkills = () => fetchPendingSkillReviews().then(setPendingSkills);

  useEffect(() => {
    fetchAllEmployees().then(setEmployees);
    fetchIdleBenchAlerts().then(setIdleAlerts);
    fetchAllTechnicalPoints().then(setTechnicalPoints);
    loadPendingSkills();
  }, []);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const technicalPointByEmployeeId = new Map(technicalPoints.map((t) => [t.employeeId, t]));

  const handleVerify = async (id: string) => {
    await verifyEmployeeSkill(id);
    message.success('Skill verified');
    loadPendingSkills();
  };

  const handleConfirm = async (id: string) => {
    await confirmEmployeeSkill(id);
    message.success('Skill confirmed');
    loadPendingSkills();
  };

  return (
    <Row gutter={[24, 24]}>
      {idleAlerts.length > 0 && (
        <Col span={24}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {idleAlerts.map((alert) => (
              <Alert
                key={alert.employeeId}
                type="warning"
                showIcon
                message={`${employeeById.get(alert.employeeId)?.fullName ?? alert.employeeId} has been idle on bench for ${alert.daysIdle} days with no new activity logged.`}
              />
            ))}
          </Space>
        </Col>
      )}

      <Col span={24}>
        <Card title="Skill Verification Queue">
          <Table
            rowKey="id"
            dataSource={pendingSkills}
            columns={[
              {
                title: 'Employee',
                render: (_, record: EmployeeSkill) =>
                  record.employee?.fullName ?? employeeById.get(record.employeeId)?.fullName ?? record.employeeId,
              },
              { title: 'Skill', dataIndex: ['skill', 'name'] },
              { title: 'Track', dataIndex: 'track' },
              { title: 'Proficiency', dataIndex: 'proficiency' },
              { title: 'Level', dataIndex: 'level', render: (level: string | null) => level ?? '—' },
              {
                title: 'Status',
                dataIndex: 'status',
                render: (status: SkillStatus) => <SkillStatusTag status={status} />,
              },
              {
                title: 'Period',
                render: (_, record: EmployeeSkill) => `${record.startDate} → ${record.endDate ?? 'ongoing'}`,
              },
              {
                title: 'Action',
                render: (_, record: EmployeeSkill) => (
                  <Space>
                    {(record.status === SkillStatus.START || record.status === SkillStatus.LEARNING) && (
                      <Button size="small" type="primary" onClick={() => handleVerify(record.id)}>
                        Verify
                      </Button>
                    )}
                    {record.status === SkillStatus.VERIFIED && (
                      <Button size="small" type="primary" onClick={() => handleConfirm(record.id)}>
                        Confirm
                      </Button>
                    )}
                  </Space>
                ),
              },
            ]}
          />
          {pendingSkills.length === 0 && <div style={{ color: '#999' }}>Nothing pending review.</div>}
        </Card>
      </Col>

      <Col span={24}>
        <Card title="Resource Overview">
          <Table
            rowKey="id"
            dataSource={employees}
            columns={[
              { title: 'Name', dataIndex: 'fullName' },
              { title: 'Email', dataIndex: 'email' },
              {
                title: 'Level',
                dataIndex: 'level',
                render: (level: string) => <Tag>{level}</Tag>,
              },
              {
                title: 'Technical Point',
                render: (_, record: Employee) => (
                  <Tag color="purple">{technicalPointByEmployeeId.get(record.id)?.totalPoints ?? 0}</Tag>
                ),
              },
              {
                title: 'Role',
                dataIndex: 'role',
                render: (role: string) => <Tag color="blue">{role}</Tag>,
              },
              { title: 'Current Project', dataIndex: 'currentProject', render: (v: string | null) => v ?? '—' },
              {
                title: 'Work Status',
                dataIndex: 'status',
                render: (_, record: Employee) => <EmployeeWorkStatusTag status={record.status} />,
              },
              {
                title: 'Employment',
                dataIndex: 'isActive',
                render: (isActive: boolean) => (
                  <Tag color={isActive ? 'green' : 'red'}>{isActive ? 'active' : 'inactive'}</Tag>
                ),
              },
            ]}
          />
        </Card>
      </Col>
    </Row>
  );
}
