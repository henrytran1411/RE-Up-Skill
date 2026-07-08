import { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Modal,
  Statistic,
  Row,
  Col,
  InputNumber,
  Select,
  Space,
  Alert,
  Typography,
  Form,
  Input,
  DatePicker,
  Popconfirm,
  message,
} from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  EyeOutlined,
  SaveOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  PlusOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import {
  fetchAllProjects,
  fetchProjectOverview,
  upsertProject,
  createProject,
  deleteProject,
} from '../../services/projectService';
import { fetchTasksForProject, createTask, updateTask, deleteTask } from '../../services/taskService';
import { fetchAllEmployees, setEmployeeSalary } from '../../services/employeeService';
import { ProjectEffortChart } from '../../components/ProjectEffortChart';
import {
  ProjectSummary,
  ProjectOverview,
  PublicProjectOverview,
  ProjectContributor,
  PublicProjectContributor,
  hasRoiData,
} from '../../types/project';
import { Employee } from '../../types/employee';
import { TaskWithEmployee } from '../../types/evaluation';
import { useAuth } from '../../context/AuthContext';
import { Role, ProjectStatus } from '../../types/common';

function formatMoney(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_TAG: Record<ProjectStatus, { color: string; label: string }> = {
  [ProjectStatus.PENDING]: { color: 'default', label: 'Pending' },
  [ProjectStatus.PROCESSING]: { color: 'processing', label: 'Processing' },
  [ProjectStatus.COMPLETED]: { color: 'success', label: 'Completed' },
};

function ProjectStatusTag({ status }: { readonly status: ProjectStatus }) {
  const { color, label } = STATUS_TAG[status];
  return <Tag color={color}>{label}</Tag>;
}

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

export function ProjectsPage() {
  const { currentEmployee } = useAuth();
  const canManage = currentEmployee?.role === Role.HR || currentEmployee?.role === Role.ADMIN;
  const canDelete = currentEmployee?.role === Role.ADMIN;
  const canManageTasks =
    currentEmployee?.role === Role.PM || currentEmployee?.role === Role.TECH_LEAD || currentEmployee?.role === Role.ADMIN;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<ProjectOverview | PublicProjectOverview | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [revenueInput, setRevenueInput] = useState<number | null>(null);
  const [managerInput, setManagerInput] = useState<string | undefined>(undefined);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [salaryDraft, setSalaryDraft] = useState<number | null>(null);
  const [savingSalary, setSavingSalary] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm] = Form.useForm();
  const [projectTasks, setProjectTasks] = useState<TaskWithEmployee[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskWithEmployee | null>(null);
  const [savingTask, setSavingTask] = useState(false);
  const [taskForm] = Form.useForm();

  const loadProjects = () => fetchAllProjects().then(setProjects);

  useEffect(() => {
    setLoading(true);
    loadProjects().finally(() => setLoading(false));
    if (canManage || canManageTasks) {
      fetchAllEmployees().then(setEmployees);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjectTasks = async (projectName: string) => {
    if (!canManageTasks) return;
    setTasksLoading(true);
    try {
      setProjectTasks(await fetchTasksForProject(projectName));
    } finally {
      setTasksLoading(false);
    }
  };

  const openDetail = async (projectName: string) => {
    setDetailLoading(true);
    try {
      const overview = await fetchProjectOverview(projectName);
      setDetail(overview);
      setNameInput(overview.projectName);
      setRevenueInput(hasRoiData(overview) ? overview.revenue : null);
      setManagerInput(overview.managerId ?? undefined);
      setEditingSalaryId(null);
      await loadProjectTasks(projectName);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (projectName: string) => {
    const overview = await fetchProjectOverview(projectName);
    setDetail(overview);
    setNameInput(overview.projectName);
    await loadProjectTasks(projectName);
  };

  const handleSaveSettings = async () => {
    if (!detail) return;
    setSavingSettings(true);
    try {
      await upsertProject(detail.projectName, {
        name: nameInput === detail.projectName ? undefined : nameInput,
        revenue: revenueInput ?? undefined,
        managerId: managerInput,
      });
      message.success('Project settings updated');
      await refreshDetail(nameInput || detail.projectName);
      loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to update project'));
    } finally {
      setSavingSettings(false);
    }
  };

  const openCreateModal = () => {
    createForm.resetFields();
    setCreateModalOpen(true);
  };

  const handleCreate = async () => {
    const values = await createForm.validateFields();
    setCreating(true);
    try {
      await createProject(values);
      message.success('Project created');
      setCreateModalOpen(false);
      loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to create project'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (projectName: string) => {
    try {
      await deleteProject(projectName);
      message.success('Project deleted');
      loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete project'));
    }
  };

  const openCreateTaskModal = () => {
    setEditingTask(null);
    taskForm.resetFields();
    setTaskModalOpen(true);
  };

  const openEditTaskModal = (task: TaskWithEmployee) => {
    setEditingTask(task);
    taskForm.setFieldsValue({
      employeeId: task.employeeId,
      taskName: task.taskName,
      estimateHours: task.estimateHours,
      complexity: task.complexity,
      points: task.points,
      actualHours: task.actualHours ?? undefined,
      bugCount: task.bugCount,
      pmRating: task.pmRating ?? undefined,
      completedAt: task.completedAt ? dayjs(task.completedAt) : undefined,
    });
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = async () => {
    if (!detail) return;
    const values = await taskForm.validateFields();
    const payload = {
      ...values,
      completedAt: values.completedAt ? values.completedAt.format('YYYY-MM-DD') : undefined,
    };
    setSavingTask(true);
    try {
      if (editingTask) {
        await updateTask(editingTask.id, payload);
        message.success('Task updated');
      } else {
        await createTask({ ...payload, projectName: detail.projectName });
        message.success('Task created');
      }
      setTaskModalOpen(false);
      await refreshDetail(detail.projectName);
      loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save task'));
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (task: TaskWithEmployee) => {
    if (!detail) return;
    try {
      await deleteTask(task.id);
      message.success('Task deleted');
      await refreshDetail(detail.projectName);
      loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete task'));
    }
  };

  const startEditSalary = (contributor: ProjectContributor) => {
    setEditingSalaryId(contributor.employeeId);
    setSalaryDraft(contributor.monthlySalary);
  };

  const cancelEditSalary = () => {
    setEditingSalaryId(null);
    setSalaryDraft(null);
  };

  const saveSalary = async (employeeId: string) => {
    if (salaryDraft === null || !detail) return;
    setSavingSalary(true);
    try {
      await setEmployeeSalary(employeeId, salaryDraft);
      message.success('Salary updated');
      setEditingSalaryId(null);
      await refreshDetail(detail.projectName);
    } finally {
      setSavingSalary(false);
    }
  };

  const roiOverview = detail && hasRoiData(detail) ? detail : null;

  return (
    <Card
      title="Projects"
      extra={
        canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            Add Project
          </Button>
        )
      }
    >
      <Table
        rowKey="projectName"
        loading={loading}
        dataSource={projects}
        columns={[
          { title: 'Project', dataIndex: 'projectName' },
          { title: 'Status', render: (_, record: ProjectSummary) => <ProjectStatusTag status={record.status} /> },
          { title: 'Manager', render: (_, record: ProjectSummary) => record.managerName ?? '—' },
          {
            title: 'Tasks',
            render: (_, record: ProjectSummary) => `${record.completedTaskCount} / ${record.taskCount} completed`,
          },
          { title: 'Contributors', dataIndex: 'contributorCount' },
          { title: 'Total Points', dataIndex: 'totalPoints' },
          { title: 'Total Estimate (hrs)', dataIndex: 'totalEstimateHours' },
          { title: 'Total Actual (hrs)', dataIndex: 'totalActualHours' },
          {
            title: 'Actions',
            render: (_, record: ProjectSummary) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.projectName)}>
                  View
                </Button>
                {canDelete && (
                  <Popconfirm
                    title="Delete this project?"
                    description="Blocked if any task records still reference it."
                    onConfirm={() => handleDelete(record.projectName)}
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
        title="Add project"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={creating}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="name" label="Project name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="managerId" label="Manager">
            <Select
              allowClear
              placeholder="Unassigned"
              options={employees.map((e) => ({ value: e.id, label: e.fullName }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="revenue" label="Revenue">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 50000" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={
          detail ? (
            <Space>
              {detail.projectName}
              <ProjectStatusTag status={detail.status} />
            </Space>
          ) : (
            'Project overview'
          )
        }
        open={detail !== null || detailLoading}
        onCancel={() => setDetail(null)}
        footer={null}
        width={900}
      >
        {detailLoading || !detail ? (
          'Loading…'
        ) : (
          <>
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col span={6}>
                <Statistic title="Tasks" value={`${detail.completedTaskCount} / ${detail.taskCount}`} />
              </Col>
              <Col span={6}>
                <Statistic title="Contributors" value={detail.contributorCount} />
              </Col>
              <Col span={6}>
                <Statistic title="Total Points" value={detail.totalPoints} />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Total Estimate / Actual Hours"
                  value={detail.totalEstimateHours}
                  suffix={`/ ${detail.totalActualHours}`}
                />
              </Col>
            </Row>

            <ProjectEffortChart contributors={detail.contributors} />

            <Table
              rowKey="employeeId"
              size="small"
              style={{ marginTop: 16 }}
              pagination={false}
              dataSource={detail.contributors}
              columns={[
                { title: 'Employee', dataIndex: 'employeeName' },
                { title: 'Tasks', dataIndex: 'taskCount' },
                {
                  title: 'Points',
                  render: (_, record: PublicProjectContributor) => `${record.points} (${record.pointsEffortPercent}%)`,
                },
                {
                  title: 'Estimate hrs',
                  render: (_, record: PublicProjectContributor) =>
                    `${record.estimateHours} (${record.estimateEffortPercent}%)`,
                },
                {
                  title: 'Actual hrs',
                  render: (_, record: PublicProjectContributor) =>
                    `${record.actualHours} (${record.actualEffortPercent}%)`,
                },
              ]}
            />

            {canManageTasks && (
              <>
                <Typography.Title level={5} style={{ marginTop: 24 }}>
                  Task Management
                </Typography.Title>
                <Button
                  size="small"
                  type="primary"
                  icon={<PlusOutlined />}
                  style={{ marginBottom: 8 }}
                  onClick={openCreateTaskModal}
                >
                  Add Task
                </Button>
                <Table
                  rowKey="id"
                  size="small"
                  loading={tasksLoading}
                  pagination={false}
                  dataSource={projectTasks}
                  columns={[
                    { title: 'Task', dataIndex: 'taskName' },
                    { title: 'Employee', render: (_, record: TaskWithEmployee) => record.employee.fullName },
                    { title: 'Estimate hrs', dataIndex: 'estimateHours' },
                    {
                      title: 'Actual hrs',
                      render: (_, record: TaskWithEmployee) => record.actualHours ?? '—',
                    },
                    { title: 'Points', dataIndex: 'points' },
                    { title: 'Complexity', dataIndex: 'complexity' },
                    { title: 'Bugs', dataIndex: 'bugCount' },
                    {
                      title: 'PM Rating',
                      render: (_, record: TaskWithEmployee) => record.pmRating ?? '—',
                    },
                    {
                      title: 'Completed',
                      render: (_, record: TaskWithEmployee) => record.completedAt ?? '—',
                    },
                    {
                      title: 'Actions',
                      render: (_, record: TaskWithEmployee) => (
                        <Space>
                          <Button size="small" icon={<EditOutlined />} onClick={() => openEditTaskModal(record)} />
                          <Popconfirm
                            title="Delete this task?"
                            description="This cannot be undone."
                            onConfirm={() => handleDeleteTask(record)}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            )}

            {canManage && (
              <>
                <Typography.Title level={5} style={{ marginTop: 24 }}>
                  Project settings
                </Typography.Title>
                <Space wrap style={{ marginBottom: 16 }}>
                  <span>Name:</span>
                  <Input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    style={{ width: 200 }}
                  />
                  <span>Manager:</span>
                  <Select
                    allowClear
                    placeholder="Unassigned"
                    style={{ width: 220 }}
                    value={managerInput}
                    onChange={(value) => setManagerInput(value)}
                    options={employees.map((e) => ({ value: e.id, label: e.fullName }))}
                    showSearch
                    optionFilterProp="label"
                  />
                  <span>Project revenue:</span>
                  <InputNumber
                    min={0}
                    value={revenueInput ?? undefined}
                    onChange={(value) => setRevenueInput(value)}
                    style={{ width: 160 }}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={<SaveOutlined />}
                    loading={savingSettings}
                    onClick={handleSaveSettings}
                  >
                    Save
                  </Button>
                </Space>
              </>
            )}

            {roiOverview && (
              <>
                <Typography.Title level={5} style={{ marginTop: 24 }}>
                  Return on Investment
                </Typography.Title>

                {roiOverview.contributorsMissingSalaryCount > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`${roiOverview.contributorsMissingSalaryCount} of ${roiOverview.contributorCount} contributors have no salary on file — their cost is excluded, so Total Cost / Net Profit below understate reality.`}
                  />
                )}

                <Row gutter={16} style={{ marginBottom: 16 }}>
                  <Col span={6}>
                    <Statistic title="Revenue" value={formatMoney(roiOverview.revenue)} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="Total Cost" value={formatMoney(roiOverview.totalCost)} />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="Net Profit"
                      value={formatMoney(roiOverview.netProfit)}
                      valueStyle={{ color: roiOverview.netProfit >= 0 ? '#3f8600' : '#cf1322' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="ROI"
                      value={roiOverview.roiPercent === null ? 'N/A' : `${roiOverview.roiPercent}%`}
                      valueStyle={{ color: (roiOverview.roiPercent ?? 0) >= 0 ? '#3f8600' : '#cf1322' }}
                    />
                  </Col>
                </Row>

                <Table
                  rowKey="employeeId"
                  size="small"
                  pagination={false}
                  dataSource={roiOverview.contributors}
                  columns={[
                    { title: 'Employee', dataIndex: 'employeeName' },
                    {
                      title: 'Monthly Salary',
                      render: (_, record: ProjectContributor) => {
                        if (editingSalaryId === record.employeeId) {
                          return (
                            <Space>
                              <InputNumber
                                min={0}
                                autoFocus
                                size="small"
                                style={{ width: 110 }}
                                value={salaryDraft ?? undefined}
                                onChange={(value) => setSalaryDraft(value)}
                              />
                              <Button
                                size="small"
                                type="text"
                                icon={<CheckOutlined />}
                                loading={savingSalary}
                                onClick={() => saveSalary(record.employeeId)}
                              />
                              <Button size="small" type="text" icon={<CloseOutlined />} onClick={cancelEditSalary} />
                            </Space>
                          );
                        }
                        return (
                          <Space>
                            {formatMoney(record.monthlySalary)}
                            {canManage && (
                              <Button
                                size="small"
                                type="text"
                                icon={<EditOutlined />}
                                onClick={() => startEditSalary(record)}
                              />
                            )}
                          </Space>
                        );
                      },
                    },
                    { title: 'Hours Spent', dataIndex: 'hoursSpent' },
                    { title: 'Cost', render: (_, record: ProjectContributor) => formatMoney(record.cost) },
                    {
                      title: 'Revenue Share',
                      render: (_, record: ProjectContributor) => formatMoney(record.revenueShare),
                    },
                    {
                      title: 'Net Contribution',
                      render: (_, record: ProjectContributor) => formatMoney(record.netContribution),
                    },
                    {
                      title: 'ROI',
                      render: (_, record: ProjectContributor) =>
                        record.roiPercent === null ? 'N/A' : `${record.roiPercent}%`,
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Modal>

      <Modal
        title={editingTask ? 'Edit task' : 'Add task'}
        open={taskModalOpen}
        onOk={handleTaskSubmit}
        onCancel={() => setTaskModalOpen(false)}
        confirmLoading={savingTask}
      >
        <Form form={taskForm} layout="vertical">
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <Select
              options={employees.map((e) => ({ value: e.id, label: e.fullName }))}
              showSearch
              optionFilterProp="label"
            />
          </Form.Item>
          <Form.Item name="taskName" label="Task name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="estimateHours" label="Estimate hours" rules={[{ required: true }]}>
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="complexity" label="Complexity (1-5)" rules={[{ required: true }]}>
              <InputNumber min={1} max={5} />
            </Form.Item>
            <Form.Item name="points" label="Points" rules={[{ required: true }]}>
              <InputNumber min={1} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }}>
            <Form.Item name="actualHours" label="Actual hours">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="bugCount" label="Bug count">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="pmRating" label="PM rating (1-5)">
              <InputNumber min={1} max={5} />
            </Form.Item>
          </Space>
          <Form.Item name="completedAt" label="Completed date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
