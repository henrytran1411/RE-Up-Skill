import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Space,
  Modal,
  Form,
  DatePicker,
  Popconfirm,
  Divider,
  Typography,
  Row,
  Col,
  Statistic,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  fetchAllEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fetchEmployeeLevelHistory,
  EmployeeSearchFilters,
} from '../../services/employeeService';
import { fetchSkillHistory } from '../../services/skillService';
import { fetchAllEmployeeLevels } from '../../services/employeeLevelService';
import { fetchAllEmployeeRoles } from '../../services/employeeRoleService';
import { fetchAllTechnicalPoints } from '../../services/technicalPointService';
import { fetchAllTaskScores, fetchTaskScoreHistoryForEmployee } from '../../services/taskScoreService';
import { fetchProjectHistoryForEmployee } from '../../services/evaluationService';
import {
  fetchPerformanceScoreHistoryForEmployee,
  snapshotPerformancePeriodForAllEmployees,
  snapshotPerformancePeriodForEmployee,
} from '../../services/performanceService';
import { EmployeeWorkStatusTag } from '../../components/EmployeeWorkStatusTag';
import { LevelHistoryTimeline } from '../../components/LevelHistoryTimeline';
import { LevelHistoryChart } from '../../components/LevelHistoryChart';
import { SkillPortfolioChart } from '../../components/SkillPortfolioChart';
import { ProjectHistoryPanel } from '../../components/ProjectHistoryPanel';
import { PointsHistoryChart } from '../../components/PointsHistoryChart';
import { PerformanceScoreChart } from '../../components/PerformanceScoreChart';
import { WorkloadHistoryChart } from '../../components/WorkloadHistoryChart';
import { useAuth } from '../../context/AuthContext';
import { Employee, LevelHistoryEntry } from '../../types/employee';
import { EmployeeSkill } from '../../types/skill';
import { ProjectHistoryEntry } from '../../types/evaluation';
import { EmployeeLevel } from '../../types/employeeLevel';
import { EmployeeRole } from '../../types/employeeRole';
import { TechnicalPointBreakdown } from '../../types/technicalPoint';
import { EmployeeTaskScore } from '../../types/taskScore';
import { PerformanceScorePeriod } from '../../types/performance';
import { Role } from '../../types/common';

export function EmployeeListPage() {
  const { currentEmployee } = useAuth();
  const canManage = currentEmployee?.role === Role.HR || currentEmployee?.role === Role.ADMIN;
  const canDelete = currentEmployee?.role === Role.ADMIN;
  const isAdmin = currentEmployee?.role === Role.ADMIN;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filters, setFilters] = useState<EmployeeSearchFilters>({});
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [levelHistory, setLevelHistory] = useState<LevelHistoryEntry[]>([]);
  const [skillHistory, setSkillHistory] = useState<EmployeeSkill[]>([]);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [employeeLevels, setEmployeeLevels] = useState<EmployeeLevel[]>([]);
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([]);
  const [technicalPoints, setTechnicalPoints] = useState<TechnicalPointBreakdown[]>([]);
  const [taskScores, setTaskScores] = useState<EmployeeTaskScore[]>([]);
  const [pointsHistory, setPointsHistory] = useState<EmployeeTaskScore[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceScorePeriod[]>([]);
  const [snapshotting, setSnapshotting] = useState(false);
  const [bulkSnapshotting, setBulkSnapshotting] = useState(false);
  const [form] = Form.useForm();

  const technicalPointByEmployeeId = new Map(technicalPoints.map((t) => [t.employeeId, t]));
  const taskScoreByEmployeeId = new Map(taskScores.map((t) => [t.employeeId, t]));
  const employeeLevelOptions = employeeLevels.map((l) => ({ value: l.name, label: l.name }));
  const employeeRoleOptions = employeeRoles.map((r) => ({ value: r.name, label: r.name }));

  const loadEmployees = async (nextFilters: EmployeeSearchFilters = filters) => {
    setLoading(true);
    try {
      setEmployees(await fetchAllEmployees(nextFilters));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
    fetchAllEmployeeLevels().then(setEmployeeLevels);
    fetchAllEmployeeRoles().then(setEmployeeRoles);
    fetchAllTechnicalPoints().then(setTechnicalPoints);
    fetchAllTaskScores().then(setTaskScores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (patch: Partial<EmployeeSearchFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    loadEmployees(next);
  };

  const openCreateModal = () => {
    setEditingEmployee(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEditModal = (employee: Employee) => {
    setEditingEmployee(employee);
    form.setFieldsValue({
      fullName: employee.fullName,
      email: employee.email,
      role: employee.role,
      level: employee.level,
      currentProject: employee.currentProject ?? undefined,
      availableFrom: employee.availableFrom ? dayjs(employee.availableFrom) : undefined,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    const availableFrom = values.availableFrom ? values.availableFrom.format('YYYY-MM-DD') : undefined;
    if (editingEmployee) {
      await updateEmployee(editingEmployee.id, { ...values, availableFrom });
      message.success('Employee updated');
    } else {
      await createEmployee({
        ...values,
        levelEffectiveDate: values.levelEffectiveDate.format('YYYY-MM-DD'),
        joinDate: values.joinDate.format('YYYY-MM-DD'),
        availableFrom,
      });
      message.success('Employee created');
    }
    setModalOpen(false);
    loadEmployees();
  };

  const handleDelete = async (id: string) => {
    await deleteEmployee(id);
    message.success('Employee deleted');
    loadEmployees();
  };

  const openHistoryModal = async (employee: Employee) => {
    setHistoryEmployee(employee);
    setHistoryLoading(true);
    try {
      const [levels, skills, projects, points, performance] = await Promise.all([
        fetchEmployeeLevelHistory(employee.id),
        fetchSkillHistory({ employeeId: employee.id }),
        fetchProjectHistoryForEmployee(employee.id),
        fetchTaskScoreHistoryForEmployee(employee.id),
        fetchPerformanceScoreHistoryForEmployee(employee.id),
      ]);
      setLevelHistory(levels);
      setSkillHistory(skills);
      setProjectHistory(projects);
      setPointsHistory(points);
      setPerformanceHistory(performance);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSnapshotCurrentPeriod = async () => {
    if (!historyEmployee) return;
    setSnapshotting(true);
    try {
      await snapshotPerformancePeriodForEmployee(historyEmployee.id);
      message.success('Current period snapshotted');
      setPerformanceHistory(await fetchPerformanceScoreHistoryForEmployee(historyEmployee.id));
    } finally {
      setSnapshotting(false);
    }
  };

  const handleSnapshotAllEmployees = async () => {
    setBulkSnapshotting(true);
    try {
      const { count } = await snapshotPerformancePeriodForAllEmployees();
      message.success(`Snapshotted the current period for ${count} employees`);
    } finally {
      setBulkSnapshotting(false);
    }
  };

  return (
    <Card
      title="Employees"
      extra={
        <Space>
          {isAdmin && (
            <Popconfirm
              title="Snapshot the current period for every employee?"
              description="Freezes each employee's current half-year Performance Score. Safe to re-run before the period closes."
              onConfirm={handleSnapshotAllEmployees}
            >
              <Button loading={bulkSnapshotting}>Snapshot Current Period (All Employees)</Button>
            </Popconfirm>
          )}
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              Add Employee
            </Button>
          )}
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="Search name or email"
          allowClear
          style={{ width: 240 }}
          prefix={<SearchOutlined />}
          onSearch={(value) => applyFilters({ search: value || undefined })}
        />
        <Select
          placeholder="Level"
          allowClear
          style={{ width: 140 }}
          options={employeeLevelOptions}
          onChange={(value) => applyFilters({ level: value })}
        />
        <Select
          placeholder="Role"
          allowClear
          style={{ width: 140 }}
          options={employeeRoleOptions}
          onChange={(value) => applyFilters({ role: value })}
        />
      </Space>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={employees}
        columns={[
          { title: 'Name', dataIndex: 'fullName' },
          { title: 'Email', dataIndex: 'email' },
          { title: 'Level', dataIndex: 'level', render: (level: string) => <Tag>{level}</Tag> },
          {
            title: 'Technical Point',
            render: (_, record: Employee) => (
              <Tag color="purple">{technicalPointByEmployeeId.get(record.id)?.totalPoints ?? 0}</Tag>
            ),
          },
          {
            title: taskScores[0] ? `Task Score (${taskScores[0].year})` : 'Task Score',
            render: (_, record: Employee) => {
              const score = taskScoreByEmployeeId.get(record.id);
              if (!score || score.completedTaskCount === 0) {
                return <Tag>—</Tag>;
              }
              return <Tag color="geekblue">{score.taskScore}</Tag>;
            },
          },
          { title: 'Role', dataIndex: 'role', render: (role: string) => <Tag color="blue">{role}</Tag> },
          { title: 'Current Project', dataIndex: 'currentProject', render: (v: string | null) => v ?? '—' },
          {
            title: 'Work Status',
            render: (_, record: Employee) => <EmployeeWorkStatusTag status={record.status} />,
          },
          {
            title: 'Available From',
            render: (_, record: Employee) => {
              if (!record.currentProject) {
                return <Tag color="green">Available now</Tag>;
              }
              return record.availableFrom ?? <Tag>Not set</Tag>;
            },
          },
          {
            title: 'Employment',
            dataIndex: 'isActive',
            render: (isActive: boolean) => (
              <Tag color={isActive ? 'green' : 'red'}>{isActive ? 'active' : 'inactive'}</Tag>
            ),
          },
          {
            title: 'Actions',
            render: (_, record: Employee) => (
              <Space>
                <Button size="small" icon={<HistoryOutlined />} onClick={() => openHistoryModal(record)}>
                  History
                </Button>
                {canManage && (
                  <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
                    Edit
                  </Button>
                )}
                {canDelete && (
                  <Popconfirm
                    title="Delete this employee?"
                    description="This cannot be undone."
                    onConfirm={() => handleDelete(record.id)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />}>
                      Delete
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editingEmployee ? 'Edit employee' : 'Add employee'}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          {!editingEmployee && (
            <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="role" label="Role" initialValue={employeeRoles[0]?.name} rules={[{ required: true }]}>
            <Select options={employeeRoleOptions} />
          </Form.Item>
          <Form.Item name="level" label="Level" rules={[{ required: true }]}>
            <Select options={employeeLevelOptions} />
          </Form.Item>
          {!editingEmployee && (
            <>
              <Form.Item name="levelEffectiveDate" label="Level effective date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="joinDate" label="Join date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </>
          )}
          <Form.Item name="currentProject" label="Current project">
            <Input placeholder="Leave empty if on bench" />
          </Form.Item>
          <Form.Item
            name="availableFrom"
            label="Available from"
            tooltip="Expected date this employee frees up from their current project — for capacity planning."
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`History — ${historyEmployee?.fullName ?? ''}`}
        open={historyEmployee !== null}
        onCancel={() => setHistoryEmployee(null)}
        footer={null}
        width={900}
      >
        {historyLoading ? (
          'Loading…'
        ) : (
          <>
            <Typography.Title level={5}>Level history</Typography.Title>
            <LevelHistoryChart entries={levelHistory} />
            <LevelHistoryTimeline entries={levelHistory} />

            <Divider />

            <Typography.Title level={5}>Skill portfolio</Typography.Title>
            <SkillPortfolioChart entries={skillHistory} />

            <Divider />

            <Typography.Title level={5}>Technical Point Breakdown</Typography.Title>
            {(() => {
              const breakdown = historyEmployee ? technicalPointByEmployeeId.get(historyEmployee.id) : undefined;
              if (!breakdown) {
                return <div style={{ color: '#999' }}>No confirmed current skills to score yet.</div>;
              }
              return (
                <>
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col span={6}>
                      <Statistic title="A — Primary skills" value={breakdown.primaryPoints} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="B — Non-primary skills" value={breakdown.nonPrimaryPoints} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="C — Foundational skills" value={breakdown.foundationalPoints} />
                    </Col>
                    <Col span={6}>
                      <Statistic title="T = A + B + C" value={breakdown.totalPoints} valueStyle={{ color: '#722ed1' }} />
                    </Col>
                  </Row>
                  <Table
                    rowKey="employeeSkillId"
                    size="small"
                    pagination={false}
                    dataSource={breakdown.skills}
                    columns={[
                      { title: 'Skill', dataIndex: 'skillName' },
                      { title: 'Category', dataIndex: 'category', render: (v: string | null) => v ?? '—' },
                      { title: 'Level', dataIndex: 'level' },
                      { title: 'Level Weight', dataIndex: 'levelWeight' },
                      { title: 'Key Multiplier', dataIndex: 'keyMultiplier' },
                      {
                        title: 'Primary',
                        dataIndex: 'isPrimary',
                        render: (v: boolean) => (v ? <Tag color="gold">Primary</Tag> : '—'),
                      },
                      {
                        title: 'Foundational',
                        dataIndex: 'isFoundational',
                        render: (v: boolean) => (v ? <Tag color="purple">Foundational</Tag> : '—'),
                      },
                      { title: 'A', dataIndex: 'contributionToA' },
                      { title: 'B', dataIndex: 'contributionToB' },
                      { title: 'C', dataIndex: 'contributionToC' },
                    ]}
                  />
                </>
              );
            })()}

            <Divider />

            <Typography.Title level={5}>
              Performance Score by Half-Year
              {isAdmin && (
                <Button
                  size="small"
                  style={{ marginLeft: 12 }}
                  loading={snapshotting}
                  onClick={handleSnapshotCurrentPeriod}
                >
                  Snapshot Current Period
                </Button>
              )}
            </Typography.Title>
            <PerformanceScoreChart periods={performanceHistory} />

            <Divider />

            <Typography.Title level={5}>Project history</Typography.Title>
            <ProjectHistoryPanel projects={projectHistory} />

            <Divider />

            <Typography.Title level={5}>Points by year</Typography.Title>
            <PointsHistoryChart history={pointsHistory} />

            <Divider />

            <Typography.Title level={5}>Workload by year</Typography.Title>
            <WorkloadHistoryChart history={pointsHistory} />
          </>
        )}
      </Modal>
    </Card>
  );
}
