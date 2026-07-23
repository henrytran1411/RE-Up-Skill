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
  Tabs,
  Tooltip,
  Progress,
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
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  fetchAllProjects,
  fetchProjectOverview,
  upsertProject,
  createProject,
  deleteProject,
  setProjectContributionRate,
} from '../../services/projectService';
import {
  fetchTasksForProject,
  createTask,
  updateTask,
  deleteTask,
  setEpicDependencies,
} from '../../services/taskService';
import { fetchAllEmployees } from '../../services/employeeService';
import { fetchProjectHealth } from '../../services/projectHealthService';
import {
  fetchSprintsForProject,
  createSprint,
  updateSprint,
  deleteSprint,
  generateSprints,
} from '../../services/projectSprintService';
import {
  fetchNotesForProject,
  createProjectNote,
  updateProjectNote,
  deleteProjectNote,
} from '../../services/projectNoteService';
import { ProjectEffortChart } from '../../components/ProjectEffortChart';
import { ProjectContributionChart } from '../../components/ProjectContributionChart';
import { IssueTypeTag } from '../../components/IssueTypeTag';
import { ProjectHealthPanel } from '../../components/ProjectHealthPanel';
import {
  ProjectSummary,
  ProjectOverview,
  PublicProjectOverview,
  ProjectContributor,
  PublicProjectContributor,
  hasRoiData,
} from '../../types/project';
import { ProjectHealthReport, EpicHealth } from '../../types/projectHealth';
import { ProjectSprint } from '../../types/projectSprint';
import { ProjectNote } from '../../types/projectNote';
import { Employee } from '../../types/employee';
import { TaskWithEmployee } from '../../types/evaluation';
import { buildTaskHierarchy, progressPercent, TaskTreeRow } from '../../utils/taskHierarchy';
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
  const [managerInput, setManagerInput] = useState<string | undefined>(undefined);
  const [startDateInput, setStartDateInput] = useState<dayjs.Dayjs | null>(null);
  const [targetEndDateInput, setTargetEndDateInput] = useState<dayjs.Dayjs | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [healthReport, setHealthReport] = useState<ProjectHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [sprints, setSprints] = useState<ProjectSprint[]>([]);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [sprintModalOpen, setSprintModalOpen] = useState(false);
  const [editingSprint, setEditingSprint] = useState<ProjectSprint | null>(null);
  const [savingSprint, setSavingSprint] = useState(false);
  const [generatingSprints, setGeneratingSprints] = useState(false);
  const [sprintForm] = Form.useForm();
  const [notes, setNotes] = useState<ProjectNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [noteForm] = Form.useForm();
  const [savingTaskSprintId, setSavingTaskSprintId] = useState<string | null>(null);
  const [savingEpicDependencyKey, setSavingEpicDependencyKey] = useState<string | null>(null);
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
  const [searchText, setSearchText] = useState('');

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

  const loadProjectHealth = async (projectName: string) => {
    setHealthLoading(true);
    try {
      setHealthReport(await fetchProjectHealth(projectName));
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load project health'));
    } finally {
      setHealthLoading(false);
    }
  };

  const loadSprints = async (projectName: string) => {
    if (!canManageTasks) return;
    setSprintsLoading(true);
    try {
      setSprints(await fetchSprintsForProject(projectName));
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load sprints'));
    } finally {
      setSprintsLoading(false);
    }
  };

  const loadNotes = async (projectName: string) => {
    if (!canManageTasks) return;
    setNotesLoading(true);
    try {
      setNotes(await fetchNotesForProject(projectName));
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load notes'));
    } finally {
      setNotesLoading(false);
    }
  };

  const openDetail = async (projectName: string) => {
    setDetailLoading(true);
    try {
      const overview = await fetchProjectOverview(projectName);
      setDetail(overview);
      setNameInput(overview.projectName);
      setManagerInput(overview.managerId ?? undefined);
      setStartDateInput(overview.startDate ? dayjs(overview.startDate) : null);
      setTargetEndDateInput(overview.targetEndDate ? dayjs(overview.targetEndDate) : null);
      setEditingSalaryId(null);
      await Promise.all([
        loadProjectTasks(projectName),
        loadProjectHealth(projectName),
        loadSprints(projectName),
        loadNotes(projectName),
      ]);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async (projectName: string) => {
    const overview = await fetchProjectOverview(projectName);
    setDetail(overview);
    setNameInput(overview.projectName);
    setStartDateInput(overview.startDate ? dayjs(overview.startDate) : null);
    setTargetEndDateInput(overview.targetEndDate ? dayjs(overview.targetEndDate) : null);
    await Promise.all([
      loadProjectTasks(projectName),
      loadProjectHealth(projectName),
      loadSprints(projectName),
      loadNotes(projectName),
    ]);
  };

  const handleSaveSettings = async () => {
    if (!detail) return;
    setSavingSettings(true);
    try {
      await upsertProject(detail.projectName, {
        name: nameInput === detail.projectName ? undefined : nameInput,
        managerId: managerInput,
        startDate: startDateInput ? startDateInput.format('YYYY-MM-DD') : undefined,
        targetEndDate: targetEndDateInput ? targetEndDateInput.format('YYYY-MM-DD') : undefined,
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
      await createProject({
        ...values,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        targetEndDate: values.targetEndDate ? values.targetEndDate.format('YYYY-MM-DD') : undefined,
      });
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
      taskCode: task.taskCode ?? undefined,
      estimateHours: task.estimateHours,
      complexity: task.complexity,
      points: task.points,
      actualHours: task.actualHours ?? undefined,
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

  const openSprintCreateModal = () => {
    setEditingSprint(null);
    sprintForm.resetFields();
    setSprintModalOpen(true);
  };

  const openSprintEditModal = (sprint: ProjectSprint) => {
    setEditingSprint(sprint);
    sprintForm.setFieldsValue({
      sprintNumber: sprint.sprintNumber,
      name: sprint.name ?? undefined,
      startDate: dayjs(sprint.startDate),
      endDate: dayjs(sprint.endDate),
      notes: sprint.notes ?? undefined,
    });
    setSprintModalOpen(true);
  };

  const handleSprintSubmit = async () => {
    if (!detail) return;
    const values = await sprintForm.validateFields();
    const payload = {
      sprintNumber: values.sprintNumber,
      name: values.name || undefined,
      startDate: values.startDate.format('YYYY-MM-DD'),
      endDate: values.endDate.format('YYYY-MM-DD'),
      notes: values.notes || undefined,
    };
    setSavingSprint(true);
    try {
      if (editingSprint) {
        await updateSprint(detail.projectName, editingSprint.id, payload);
        message.success('Sprint updated');
      } else {
        await createSprint(detail.projectName, payload);
        message.success('Sprint created');
      }
      setSprintModalOpen(false);
      await loadSprints(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save sprint'));
    } finally {
      setSavingSprint(false);
    }
  };

  const handleSprintDelete = async (sprint: ProjectSprint) => {
    if (!detail) return;
    try {
      await deleteSprint(detail.projectName, sprint.id);
      message.success('Sprint deleted');
      await loadSprints(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete sprint'));
    }
  };

  const handleGenerateSprints = async () => {
    if (!detail) return;
    setGeneratingSprints(true);
    try {
      await generateSprints(detail.projectName);
      message.success('Sprints generated');
      await loadSprints(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to generate sprints'));
    } finally {
      setGeneratingSprints(false);
    }
  };

  const openNoteCreateModal = () => {
    setEditingNote(null);
    noteForm.resetFields();
    setNoteModalOpen(true);
  };

  const openNoteEditModal = (note: ProjectNote) => {
    setEditingNote(note);
    noteForm.setFieldsValue({ content: note.content });
    setNoteModalOpen(true);
  };

  const handleNoteSubmit = async () => {
    if (!detail) return;
    const values = await noteForm.validateFields();
    setSavingNote(true);
    try {
      if (editingNote) {
        await updateProjectNote(detail.projectName, editingNote.id, values.content);
        message.success('Note updated');
      } else {
        await createProjectNote(detail.projectName, values.content);
        message.success('Note added');
      }
      setNoteModalOpen(false);
      await loadNotes(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save note'));
    } finally {
      setSavingNote(false);
    }
  };

  const handleNoteDelete = async (note: ProjectNote) => {
    if (!detail) return;
    setDeletingNoteId(note.id);
    try {
      await deleteProjectNote(detail.projectName, note.id);
      message.success('Note deleted');
      await loadNotes(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to delete note'));
    } finally {
      setDeletingNoteId(null);
    }
  };

  const handleTaskSprintChange = async (task: TaskWithEmployee, projectSprintId: string | undefined) => {
    if (!detail) return;
    setSavingTaskSprintId(task.id);
    try {
      await updateTask(task.id, { projectSprintId });
      message.success('Task sprint updated');
      await refreshDetail(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to update task sprint'));
    } finally {
      setSavingTaskSprintId(null);
    }
  };

  const handleEpicDependenciesChange = async (epic: EpicHealth, blockedByEpicKeys: string[]) => {
    if (!detail) return;
    const task = projectTasks.find((t) => t.issueType === 'Epic' && t.jiraIssueKey === epic.key);
    if (!task) {
      message.error(`Could not find the task record behind Epic ${epic.key}`);
      return;
    }
    setSavingEpicDependencyKey(epic.key);
    try {
      await setEpicDependencies(task.id, blockedByEpicKeys);
      message.success('Epic dependencies updated');
      await loadProjectHealth(detail.projectName);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to update Epic dependencies'));
    } finally {
      setSavingEpicDependencyKey(null);
    }
  };

  const startEditSalary = (contributor: ProjectContributor) => {
    setEditingSalaryId(contributor.employeeId);
    setSalaryDraft(contributor.totalSalary);
  };

  const cancelEditSalary = () => {
    setEditingSalaryId(null);
    setSalaryDraft(null);
  };

  const saveSalary = async (employeeId: string) => {
    if (salaryDraft === null || !detail) return;
    setSavingSalary(true);
    try {
      await setProjectContributionRate(detail.projectName, employeeId, salaryDraft);
      message.success('Salary updated');
      setEditingSalaryId(null);
      await refreshDetail(detail.projectName);
    } finally {
      setSavingSalary(false);
    }
  };

  const roiOverview = detail && hasRoiData(detail) ? detail : null;

  const normalizedSearch = searchText.trim().toLowerCase();
  const filteredProjects = normalizedSearch
    ? projects.filter(
        (project) =>
          project.projectName.toLowerCase().includes(normalizedSearch) ||
          (project.managerName ?? '').toLowerCase().includes(normalizedSearch),
      )
    : projects;

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
      <Input.Search
        placeholder="Search by project name or manager"
        allowClear
        style={{ marginBottom: 16, maxWidth: 360 }}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
      />
      <Table
        rowKey="projectName"
        loading={loading}
        dataSource={filteredProjects}
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
          <Form.Item name="startDate" label="Start date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="targetEndDate" label="Target end date">
            <DatePicker style={{ width: '100%' }} />
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
        width="90%"
      >
        {detailLoading || !detail ? (
          'Loading…'
        ) : (
          <Tabs
            key={detail.projectName}
            items={[
              {
                key: 'overall',
                label: 'Overall',
                children: (
                  <>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col span={6}>
                        <Statistic title="Tasks" value={`${detail.completedTaskCount} / ${detail.taskCount}`} />
                      </Col>
                      <Col span={6}>
                        <Statistic title="Contributors" value={detail.contributorCount} />
                      </Col>
                      <Col span={6}>
                        <Statistic
                          title="Total Estimate / Actual Points"
                          value={detail.totalPoints}
                          suffix={`/ ${detail.totalActualPoints}`}
                        />
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
                          render: (_, record: PublicProjectContributor) =>
                            `${record.points} (${record.pointsEffortPercent}%)`,
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

                    {canManage && (
                      <>
                        <Typography.Title level={5} style={{ marginTop: 24 }}>
                          Project Settings
                        </Typography.Title>
                        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                          <Space wrap>
                            <span>Name:</span>
                            <Input
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              style={{ width: 200 }}
                            />
                          </Space>
                          <Space wrap>
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
                          </Space>
                          <Space wrap>
                            <span>Start date:</span>
                            <DatePicker
                              value={startDateInput}
                              onChange={(value) => setStartDateInput(value)}
                              style={{ width: 160 }}
                            />
                          </Space>
                          <Space wrap>
                            <span>Target end date:</span>
                            <DatePicker
                              value={targetEndDateInput}
                              onChange={(value) => setTargetEndDateInput(value)}
                              style={{ width: 160 }}
                            />
                          </Space>
                          <Button
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

                    <Typography.Title level={5} style={{ marginTop: 24 }}>
                      Project Health Check
                    </Typography.Title>
                    {healthLoading || !healthReport ? 'Loading…' : <ProjectHealthPanel report={healthReport} />}
                  </>
                ),
              },
              ...(canManageTasks
                ? [
                    {
                      key: 'tasks',
                      label: 'Task Management',
                      children: (
                        <>
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
                            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
                            dataSource={buildTaskHierarchy(projectTasks)}
                            columns={[
                              {
                                title: 'Task',
                                render: (_, record: TaskTreeRow) => record.taskCode ?? record.taskName,
                              },
                              {
                                title: 'Type',
                                render: (_, record: TaskWithEmployee) => <IssueTypeTag issueType={record.issueType} />,
                              },
                              { title: 'Employee', render: (_, record: TaskWithEmployee) => record.employee.fullName },
                              {
                                title: 'Sprint',
                                render: (_, record: TaskWithEmployee) => (
                                  <Select
                                    size="small"
                                    style={{ width: 110 }}
                                    allowClear
                                    placeholder="Unassigned"
                                    value={record.projectSprintId ?? undefined}
                                    loading={savingTaskSprintId === record.id}
                                    disabled={savingTaskSprintId === record.id}
                                    onChange={(value) => handleTaskSprintChange(record, value)}
                                    options={sprints.map((s) => ({
                                      value: s.id,
                                      label: `Sprint ${s.sprintNumber}`,
                                    }))}
                                  />
                                ),
                              },
                              {
                                title: 'Estimate hrs',
                                render: (_, record: TaskTreeRow) =>
                                  record.children ? record.rollupEstimateHours : record.estimateHours,
                              },
                              {
                                title: 'Actual hrs',
                                render: (_, record: TaskTreeRow) =>
                                  (record.children ? record.rollupActualHours : record.actualHours) ?? '—',
                              },
                              {
                                title: 'Points',
                                render: (_, record: TaskTreeRow) =>
                                  record.children ? record.rollupPoints : record.points,
                              },
                              {
                                title: 'Progress',
                                render: (_, record: TaskTreeRow) =>
                                  record.children ? (
                                    <Progress percent={progressPercent(record)} size="small" style={{ minWidth: 120 }} />
                                  ) : (
                                    '—'
                                  ),
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
                      ),
                    },
                  ]
                : []),
              ...(canManageTasks
                ? [
                    {
                      key: 'sprint',
                      label: 'Sprint',
                      children: (
                        <>
                          <Typography.Paragraph type="secondary">
                            Defined manually — Jira's own sprint field varies per instance and is often unset on
                            backlog items, so sprints are planned here and assigned to tasks in the Task Management
                            tab instead of synced.
                          </Typography.Paragraph>
                          <Space style={{ marginBottom: 8 }}>
                            <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openSprintCreateModal}>
                              Add Sprint
                            </Button>
                            <Tooltip
                              title={
                                detail.startDate && detail.targetEndDate
                                  ? 'Fills in sequential 2-week (10 working day) sprints from the start date through the target end date — existing sprint numbers are left untouched.'
                                  : 'Set both a start date and a target end date in the Project Settings section of the Overall tab first.'
                              }
                            >
                              <Button
                                size="small"
                                icon={<ThunderboltOutlined />}
                                loading={generatingSprints}
                                disabled={!detail.startDate || !detail.targetEndDate}
                                onClick={handleGenerateSprints}
                              >
                                Quick Create Sprints
                              </Button>
                            </Tooltip>
                          </Space>
                          <Table
                            rowKey="id"
                            size="small"
                            loading={sprintsLoading}
                            pagination={false}
                            dataSource={sprints}
                            columns={[
                              { title: 'Sprint #', dataIndex: 'sprintNumber' },
                              { title: 'Name', render: (_, s: ProjectSprint) => s.name ?? '—' },
                              { title: 'Start', dataIndex: 'startDate' },
                              { title: 'End', dataIndex: 'endDate' },
                              { title: 'Notes', render: (_, s: ProjectSprint) => s.notes ?? '—' },
                              {
                                title: 'Actions',
                                render: (_, s: ProjectSprint) => (
                                  <Space>
                                    <Button size="small" icon={<EditOutlined />} onClick={() => openSprintEditModal(s)} />
                                    <Popconfirm
                                      title="Delete this sprint?"
                                      description="Blocked if any task is still assigned to it."
                                      onConfirm={() => handleSprintDelete(s)}
                                    >
                                      <Button size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                  </Space>
                                ),
                              },
                            ]}
                          />
                        </>
                      ),
                    },
                  ]
                : []),
              ...(canManageTasks
                ? [
                    {
                      key: 'notes',
                      label: 'Notes',
                      children: (
                        <>
                          <Button
                            size="small"
                            type="primary"
                            icon={<PlusOutlined />}
                            style={{ marginBottom: 12 }}
                            onClick={openNoteCreateModal}
                          >
                            Add Note
                          </Button>
                          {notesLoading ? (
                            'Loading…'
                          ) : notes.length === 0 ? (
                            <Typography.Paragraph type="secondary">No notes yet for this project.</Typography.Paragraph>
                          ) : (
                            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                              {notes.map((note) => {
                                const canEdit = note.authorId === currentEmployee?.id || currentEmployee?.role === Role.ADMIN;
                                return (
                                  <Card key={note.id} size="small">
                                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                        <Typography.Text type="secondary">
                                          {note.author.fullName} — {new Date(note.createdAt).toLocaleString()}
                                          {note.updatedAt !== note.createdAt ? ' (edited)' : ''}
                                        </Typography.Text>
                                        {canEdit && (
                                          <Space>
                                            <Button
                                              size="small"
                                              icon={<EditOutlined />}
                                              onClick={() => openNoteEditModal(note)}
                                            />
                                            <Popconfirm
                                              title="Delete this note?"
                                              description="This cannot be undone."
                                              onConfirm={() => handleNoteDelete(note)}
                                            >
                                              <Button
                                                size="small"
                                                danger
                                                icon={<DeleteOutlined />}
                                                loading={deletingNoteId === note.id}
                                              />
                                            </Popconfirm>
                                          </Space>
                                        )}
                                      </Space>
                                      <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                                        {note.content}
                                      </Typography.Paragraph>
                                    </Space>
                                  </Card>
                                );
                              })}
                            </Space>
                          )}
                        </>
                      ),
                    },
                  ]
                : []),
              ...(canManageTasks
                ? [
                    {
                      key: 'criticalPath',
                      label: 'Critical Path',
                      children: (
                        <>
                          <Typography.Paragraph type="secondary">
                            Mark which Epics each Epic depends on — the critical path is the longest resulting
                            dependency chain, recomputed automatically every time you change these.
                          </Typography.Paragraph>
                          {healthLoading || !healthReport ? (
                            'Loading…'
                          ) : healthReport.epics.length === 0 ? (
                            <Alert type="info" showIcon message="No Epic issues found for this project yet." />
                          ) : (
                            <>
                              <Table
                                rowKey="key"
                                size="small"
                                pagination={false}
                                dataSource={healthReport.epics}
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
                                    title: 'Depends on (blocked by)',
                                    render: (_, epic: EpicHealth) => (
                                      <Select
                                        mode="multiple"
                                        size="small"
                                        style={{ minWidth: 240 }}
                                        placeholder="None"
                                        value={epic.blockedByEpicKeys}
                                        loading={savingEpicDependencyKey === epic.key}
                                        disabled={savingEpicDependencyKey === epic.key}
                                        onChange={(keys) => handleEpicDependenciesChange(epic, keys)}
                                        options={healthReport.epics
                                          .filter((e) => e.key !== epic.key)
                                          .map((e) => ({ value: e.key, label: `${e.name} (${e.key})` }))}
                                      />
                                    ),
                                  },
                                ]}
                              />
                              {healthReport.criticalPath.length > 0 && (
                                <Typography.Paragraph style={{ marginTop: 16 }}>
                                  <strong>Critical path:</strong>{' '}
                                  {healthReport.criticalPath
                                    .map((key) => healthReport.epics.find((e) => e.key === key))
                                    .filter((e): e is EpicHealth => e !== undefined)
                                    .map((e) => `${e.name} (${e.key})`)
                                    .join(' → ')}
                                </Typography.Paragraph>
                              )}
                            </>
                          )}
                        </>
                      ),
                    },
                  ]
                : []),
              ...(roiOverview
                ? [
                    {
                      key: 'contribution',
                      label: 'Project Contribution',
                      children: (
                        <>
                          {roiOverview.contributorsMissingSalaryCount > 0 && (
                            <Alert
                              type="warning"
                              showIcon
                              style={{ marginBottom: 16 }}
                              message={`${roiOverview.contributorsMissingSalaryCount} of ${roiOverview.contributorCount} contributors have no rate on file for this project — their contribution value is excluded below until one is set.`}
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
                                title="Total Contribution Value"
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

                          <Typography.Title level={5}>Contribution Value by Employee</Typography.Title>
                          <ProjectContributionChart contributors={roiOverview.contributors} />

                          <Typography.Title level={5} style={{ marginTop: 24 }}>
                            Contribution Detail
                          </Typography.Title>
                          <Table
                            rowKey="employeeId"
                            size="small"
                            pagination={false}
                            dataSource={roiOverview.contributors}
                            columns={[
                              { title: 'Employee', dataIndex: 'employeeName' },
                              {
                                title: 'Total Salary',
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
                                      {formatMoney(record.totalSalary)}
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
                      ),
                    },
                  ]
                : []),
            ]}
          />
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
          <Form.Item
            name="taskCode"
            label="Task Code"
            extra="Shown instead of the title in Task Management, e.g. Epic-1, US-1.1, Task-1.1.1, SubTask-1.1.1.1"
          >
            <Input placeholder="e.g. Task-1.1.1" />
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
          <Form.Item name="actualHours" label="Actual hours">
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item name="completedAt" label="Completed date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingSprint ? 'Edit sprint' : 'Add sprint'}
        open={sprintModalOpen}
        onOk={handleSprintSubmit}
        onCancel={() => setSprintModalOpen(false)}
        confirmLoading={savingSprint}
      >
        <Form form={sprintForm} layout="vertical">
          <Form.Item name="sprintNumber" label="Sprint #" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="name" label="Name (optional)">
            <Input placeholder="e.g. Sprint 1 — Foundations" />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="endDate" label="End date" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
          </Space>
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={3} placeholder="Planning or retrospective notes for this sprint" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={editingNote ? 'Edit note' : 'Add note'}
        open={noteModalOpen}
        onOk={handleNoteSubmit}
        onCancel={() => setNoteModalOpen(false)}
        confirmLoading={savingNote}
      >
        <Form form={noteForm} layout="vertical">
          <Form.Item name="content" label="Note" rules={[{ required: true, message: 'Required' }]}>
            <Input.TextArea rows={5} placeholder="Status update, decision, risk, etc." />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
