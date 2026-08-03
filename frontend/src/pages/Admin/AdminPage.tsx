import { useEffect, useState } from 'react';
import {
  Card,
  Space,
  Alert,
  Form,
  Input,
  Button,
  Checkbox,
  Switch,
  Typography,
  Table,
  Tag,
  Select,
  Modal,
  DatePicker,
  message,
  Progress,
  Divider,
  InputNumber,
  Upload,
} from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  CloudSyncOutlined,
  LinkOutlined,
  FolderOutlined,
  PlusOutlined,
  ApartmentOutlined,
  UploadOutlined,
  FileAddOutlined,
} from '@ant-design/icons';
import {
  fetchJiraConfig,
  upsertJiraConfig,
  fetchJiraProjects,
  runJiraSync,
  runJiraSingleProjectSync,
  runJiraProjectSync,
  fetchJiraSyncLogs,
  fetchJiraUsers,
  createJiraIssue,
  createJiraIssuesBulk,
  pushProjectToJira,
  JiraSyncSummary,
} from '../../services/jiraService';
import { fetchAllEmployees, createEmployee } from '../../services/employeeService';
import { fetchAllEmployeeLevels } from '../../services/employeeLevelService';
import { fetchAllEmployeeRoles } from '../../services/employeeRoleService';
import { fetchAllProjects } from '../../services/projectService';
import { fetchTasksForProject } from '../../services/taskService';
import {
  JIRA_ISSUE_TYPES,
  JiraConfigSummary,
  JiraCreateIssueResult,
  JiraProjectPushRow,
  JiraProjectPushSummary,
  JiraProjectSummary,
  JiraProjectSyncSummary,
  JiraSyncLog,
  JiraUserSummary,
} from '../../types/jira';
import { Employee } from '../../types/employee';
import { EmployeeLevel } from '../../types/employeeLevel';
import { EmployeeRole } from '../../types/employeeRole';
import { ProjectSummary } from '../../types/project';
import { TaskWithEmployee } from '../../types/evaluation';
import { buildTaskHierarchy, progressPercent, TaskTreeRow } from '../../utils/taskHierarchy';
import { IssueTypeTag } from '../../components/IssueTypeTag';

const DEFAULT_TEMP_PASSWORD = 'Password123!';

/** Jira display names here often carry an internal code prefix, e.g. "SMD172-My Pham" or "VT001 - Arthur Bonhomme". */
function stripCodePrefix(displayName: string): string {
  return displayName.replace(/^[A-Za-z]{2,}\d+\s*-\s*/, '').trim();
}

/**
 * Jira Cloud doesn't return other users' real email over the REST API (privacy
 * restriction) — this is a best-effort guess from the display name and the
 * connected account's own email domain, meant to be reviewed/edited before
 * creating an employee, not treated as a known fact. Format: first name word,
 * a dot, then every remaining word run together — e.g. "Giang Tran Nu Tra" ->
 * "giang.trannutra@domain".
 */
function deriveCandidateEmail(displayName: string, domain: string): string {
  if (!domain) return '';
  const asciiName = stripCodePrefix(displayName)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const words = asciiName
    .replace(/[^a-z0-9\s]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  const [firstWord, ...rest] = words;
  const localPart = rest.length > 0 ? `${firstWord}.${rest.join('')}` : firstWord;
  return `${localPart}@${domain}`;
}

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
}

const STATUS_COLOR: Record<JiraSyncLog['status'], string> = {
  success: 'success',
  partial: 'warning',
  failed: 'error',
  skipped: 'default',
};

export function AdminPage() {
  const [config, setConfig] = useState<JiraConfigSummary | null>(null);
  const [connectForm] = Form.useForm();
  const [connecting, setConnecting] = useState(false);
  const [projects, setProjects] = useState<JiraProjectSummary[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProjectKeys, setSelectedProjectKeys] = useState<string[]>([]);
  const [syncAllProjects, setSyncAllProjects] = useState(false);
  const [savingAndSyncing, setSavingAndSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<JiraSyncSummary | null>(null);
  const [syncingProjects, setSyncingProjects] = useState(false);
  const [projectSyncResult, setProjectSyncResult] = useState<JiraProjectSyncSummary | null>(null);
  const [logs, setLogs] = useState<JiraSyncLog[]>([]);
  const [singleProjectKey, setSingleProjectKey] = useState<string | undefined>(undefined);
  const [syncingSingleProject, setSyncingSingleProject] = useState(false);
  const [singleProjectSyncResult, setSingleProjectSyncResult] = useState<JiraSyncSummary | null>(null);

  const [createIssueForm] = Form.useForm();
  const [creatingIssue, setCreatingIssue] = useState(false);
  const [createIssueResult, setCreateIssueResult] = useState<JiraCreateIssueResult | null>(null);
  const [bulkProjectKey, setBulkProjectKey] = useState<string | undefined>(undefined);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResults, setBulkResults] = useState<JiraCreateIssueResult[] | null>(null);

  const [pushLocalProjectName, setPushLocalProjectName] = useState<string | undefined>(undefined);
  const [pushTargetJiraKey, setPushTargetJiraKey] = useState<string | undefined>(undefined);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<JiraProjectPushSummary | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jiraUsers, setJiraUsers] = useState<JiraUserSummary[]>([]);
  const [loadingJiraUsers, setLoadingJiraUsers] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTargetUser, setCreateTargetUser] = useState<JiraUserSummary | null>(null);
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [createForm] = Form.useForm();

  const [employeeLevels, setEmployeeLevels] = useState<EmployeeLevel[]>([]);
  const [employeeRoles, setEmployeeRoles] = useState<EmployeeRole[]>([]);

  const [hierarchyProjects, setHierarchyProjects] = useState<ProjectSummary[]>([]);
  const [selectedHierarchyProject, setSelectedHierarchyProject] = useState<string | undefined>(undefined);
  const [hierarchyTasks, setHierarchyTasks] = useState<TaskWithEmployee[]>([]);
  const [hierarchyLoading, setHierarchyLoading] = useState(false);

  const employeeLevelOptions = employeeLevels.map((l) => ({ value: l.name, label: l.name }));
  const employeeRoleOptions = employeeRoles.map((r) => ({ value: r.name, label: r.name }));

  const loadLogs = () => fetchJiraSyncLogs().then(setLogs);
  const loadEmployees = () => fetchAllEmployees().then(setEmployees);
  const loadEmployeeLevels = () => fetchAllEmployeeLevels().then(setEmployeeLevels);
  const loadEmployeeRoles = () => fetchAllEmployeeRoles().then(setEmployeeRoles);

  const loadJiraUsers = async () => {
    setLoadingJiraUsers(true);
    try {
      setJiraUsers(await fetchJiraUsers());
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load Jira users'));
    } finally {
      setLoadingJiraUsers(false);
    }
  };

  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      setProjects(await fetchJiraProjects());
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load Jira projects'));
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadHierarchyProjects = () => fetchAllProjects().then(setHierarchyProjects);

  const handleSelectHierarchyProject = async (projectName: string | undefined) => {
    setSelectedHierarchyProject(projectName);
    if (!projectName) {
      setHierarchyTasks([]);
      return;
    }
    setHierarchyLoading(true);
    try {
      setHierarchyTasks(await fetchTasksForProject(projectName));
    } catch (err) {
      message.error(errorMessage(err, 'Failed to load tasks for this project'));
    } finally {
      setHierarchyLoading(false);
    }
  };

  useEffect(() => {
    fetchJiraConfig().then((summary) => {
      setConfig(summary);
      connectForm.setFieldsValue({ baseUrl: summary.baseUrl ?? undefined, email: summary.email ?? undefined });
      setSelectedProjectKeys(summary.projectKeys);
      setSyncAllProjects(summary.syncAllProjects);
      if (summary.configured) {
        loadProjects();
        loadJiraUsers();
      }
    });
    loadLogs();
    loadEmployeeLevels();
    loadEmployeeRoles();
    loadEmployees();
    loadHierarchyProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = async () => {
    const values = await connectForm.validateFields(['baseUrl', 'email', 'apiToken']);
    setConnecting(true);
    try {
      await upsertJiraConfig({
        baseUrl: values.baseUrl,
        email: values.email,
        apiToken: values.apiToken || undefined,
      });
      const summary = await fetchJiraConfig();
      setConfig(summary);
      connectForm.setFieldsValue({ apiToken: undefined });
      message.success('Connected — loading your Jira projects…');
      await loadProjects();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to connect to Jira'));
    } finally {
      setConnecting(false);
    }
  };

  const handleSaveAndSync = async () => {
    const values = await connectForm.validateFields(['baseUrl', 'email']);
    setSavingAndSyncing(true);
    setSyncResult(null);
    try {
      await upsertJiraConfig({
        baseUrl: values.baseUrl,
        email: values.email,
        projectKeys: selectedProjectKeys,
        syncAllProjects,
      });
      const summary = await fetchJiraConfig();
      setConfig(summary);
      message.success('Project selection saved — syncing now…');
      const result = await runJiraSync();
      setSyncResult(result);
      if (result.status === 'failed') {
        message.error(`Jira sync failed: ${result.errorMessage}`);
      } else {
        message.success(
          `Jira sync ${result.status}: ${result.tasksCreated} created, ${result.tasksUpdated} updated, ${result.tasksSkipped} skipped`,
        );
      }
      loadLogs();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to save selection and sync'));
    } finally {
      setSavingAndSyncing(false);
    }
  };

  const handleSyncProjects = async () => {
    setSyncingProjects(true);
    setProjectSyncResult(null);
    try {
      const result = await runJiraProjectSync();
      setProjectSyncResult(result);
      if (result.status === 'failed') {
        message.error(`Project sync failed: ${result.errorMessage}`);
      } else {
        message.success(
          `Project sync ${result.status}: ${result.projectsFetched} fetched, ${result.projectsCreated} created, ${result.projectsUpdated} already existed`,
        );
      }
    } catch (err) {
      message.error(errorMessage(err, 'Failed to sync projects'));
    } finally {
      setSyncingProjects(false);
    }
  };

  const handleSyncSingleProject = async () => {
    if (!singleProjectKey) return;
    setSyncingSingleProject(true);
    setSingleProjectSyncResult(null);
    try {
      const result = await runJiraSingleProjectSync(singleProjectKey);
      setSingleProjectSyncResult(result);
      if (result.status === 'failed') {
        message.error(`Sync failed: ${result.errorMessage}`);
      } else {
        message.success(
          `Sync ${result.status}: ${result.tasksCreated} created, ${result.tasksUpdated} updated, ${result.tasksSkipped} skipped, ${result.taskCodesAssigned ?? 0} task code(s) assigned`,
        );
      }
      loadLogs();
      if (selectedHierarchyProject) {
        handleSelectHierarchyProject(selectedHierarchyProject);
      }
    } catch (err) {
      message.error(errorMessage(err, 'Failed to sync this project'));
    } finally {
      setSyncingSingleProject(false);
    }
  };

  const handleCreateIssue = async () => {
    const values = await createIssueForm.validateFields();
    setCreatingIssue(true);
    setCreateIssueResult(null);
    try {
      const result = await createJiraIssue({
        projectKey: values.projectKey,
        summary: values.summary,
        issueType: values.issueType,
        assigneeAccountId: values.assigneeAccountId || undefined,
        parentKey: values.parentKey || undefined,
        storyPoints: values.storyPoints ?? undefined,
        description: values.description || undefined,
      });
      setCreateIssueResult(result);
      if (result.success) {
        message.success(`Created ${result.issueKey} in Jira`);
        createIssueForm.resetFields(['summary', 'description', 'parentKey', 'storyPoints']);
      } else {
        message.error(result.errorMessage ?? 'Failed to create the issue');
      }
    } catch (err) {
      message.error(errorMessage(err, 'Failed to create the issue'));
    } finally {
      setCreatingIssue(false);
    }
  };

  const handleBulkCreateIssues = async () => {
    if (!bulkFile || !bulkProjectKey) return;
    setBulkUploading(true);
    setBulkResults(null);
    try {
      const results = await createJiraIssuesBulk(bulkProjectKey, bulkFile);
      setBulkResults(results);
      const successCount = results.filter((r) => r.success).length;
      message.success(`Created ${successCount} / ${results.length} issue(s) from the file`);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to bulk-create issues'));
    } finally {
      setBulkUploading(false);
    }
  };

  const handlePushProjectToJira = async () => {
    if (!pushLocalProjectName || !pushTargetJiraKey) return;
    setPushing(true);
    setPushResult(null);
    try {
      const result = await pushProjectToJira(pushLocalProjectName, pushTargetJiraKey);
      setPushResult(result);
      message.success(`Pushed ${result.pushed} / ${result.totalTasks} task(s) to Jira project ${result.jiraProjectKey}`);
    } catch (err) {
      message.error(errorMessage(err, 'Failed to push tasks to Jira'));
    } finally {
      setPushing(false);
    }
  };

  const downloadBulkCreateTemplate = () => {
    const csv =
      'summary,issueType,assigneeAccountId,parentKey,storyPoints,description\n' +
      'Example task summary,Task,,,3,Optional description';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'jira-bulk-create-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const openCreateModal = (user: JiraUserSummary) => {
    setCreateTargetUser(user);
    createForm.resetFields();
    createForm.setFieldsValue({
      fullName: stripCodePrefix(user.displayName),
      email: deriveCandidateEmail(user.displayName, config?.email?.split('@')[1] ?? ''),
      password: DEFAULT_TEMP_PASSWORD,
      role: employeeRoles[0]?.name,
      level: employeeLevels[0]?.name,
      joinDate: dayjs(),
      levelEffectiveDate: dayjs(),
    });
    setCreateModalOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!createTargetUser) return;
    const values = await createForm.validateFields();
    setCreatingEmployee(true);
    try {
      await createEmployee({
        ...values,
        levelEffectiveDate: values.levelEffectiveDate.format('YYYY-MM-DD'),
        joinDate: values.joinDate.format('YYYY-MM-DD'),
        jiraAccountId: createTargetUser.accountId,
      });
      message.success('Employee created and mapped');
      setCreateModalOpen(false);
      await loadEmployees();
    } catch (err) {
      message.error(errorMessage(err, 'Failed to create employee'));
    } finally {
      setCreatingEmployee(false);
    }
  };

  const emailDomain = config?.email?.split('@')[1] ?? '';
  const existingEmails = new Set(employees.map((e) => e.email.toLowerCase()));
  const mappedAccountIds = new Set(employees.map((e) => e.jiraAccountId).filter((id): id is string => Boolean(id)));
  const newJiraUsers = jiraUsers
    .filter((user) => user.active && user.accountType === 'atlassian' && !mappedAccountIds.has(user.accountId))
    .map((user) => ({ ...user, candidateEmail: deriveCandidateEmail(user.displayName, emailDomain) }))
    .filter((user) => user.candidateEmail && !existingEmails.has(user.candidateEmail.toLowerCase()));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <Card
        title={
          <Space>
            <CloudSyncOutlined />
            Jira Integration
          </Space>
        }
      >
        {config?.configured && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Connected to ${config.baseUrl} as ${config.email}${
              config.updatedAt ? ` — saved ${new Date(config.updatedAt).toLocaleString()}` : ''
            }`}
          />
        )}
        {syncResult && (
          <Alert
            type={syncResult.status === 'failed' ? 'error' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
            message={`Last task sync: ${syncResult.status} — ${syncResult.issuesFetched} fetched, ${syncResult.tasksCreated} created, ${syncResult.tasksUpdated} updated, ${syncResult.tasksSkipped} skipped`}
            description={syncResult.errorMessage ?? undefined}
          />
        )}
        {projectSyncResult && (
          <Alert
            type={projectSyncResult.status === 'failed' ? 'error' : 'success'}
            showIcon
            style={{ marginBottom: 16 }}
            message={`Last project sync: ${projectSyncResult.status} — ${projectSyncResult.projectsFetched} fetched, ${projectSyncResult.projectsCreated} created, ${projectSyncResult.projectsUpdated} already existed`}
            description={projectSyncResult.errorMessage ?? undefined}
          />
        )}

        <Form form={connectForm} layout="vertical">
          <Space style={{ width: '100%' }} wrap>
            <Form.Item
              name="baseUrl"
              label="Jira base URL"
              rules={[{ required: true, message: 'Required' }]}
              style={{ minWidth: 280 }}
            >
              <Input placeholder="https://yourcompany.atlassian.net" />
            </Form.Item>
            <Form.Item
              name="email"
              label="Your Jira account email"
              rules={[{ required: true, type: 'email', message: 'Valid email required' }]}
              style={{ minWidth: 240 }}
            >
              <Input placeholder="you@company.com" />
            </Form.Item>
            <Form.Item
              name="apiToken"
              label="Your Jira API token"
              style={{ minWidth: 240 }}
              extra={config?.configured ? 'Leave blank to keep the saved token' : undefined}
            >
              <Input.Password placeholder={config?.configured ? '••••••••' : 'Atlassian API token'} />
            </Form.Item>
          </Space>
          <Button icon={<LinkOutlined />} loading={connecting} onClick={handleConnect}>
            {config?.configured ? 'Reconnect & Reload Projects' : 'Connect & Load Projects'}
          </Button>
        </Form>

        {(loadingProjects || projects.length > 0) && (
          <>
            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Projects to sync
            </Typography.Title>
            <Space align="center" style={{ marginBottom: 12 }}>
              <Switch checked={syncAllProjects} onChange={setSyncAllProjects} />
              <span>Sync ALL projects visible to this Jira account</span>
            </Space>

            {syncAllProjects ? (
              <Alert
                type="info"
                showIcon
                message={`Every sync will pull every project this account can see (currently ${projects.length}) — including any created later, with no need to update the selection.`}
              />
            ) : (
              <>
                <Typography.Paragraph type="secondary">
                  Pick the Jira project(s) to pull tasks from. Every task in a selected project is synced each time you
                  run Save &amp; Sync — existing tasks (matched by Jira issue key) are updated, not duplicated.
                </Typography.Paragraph>
                <div
                  style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}
                >
                  <Checkbox.Group
                    style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    value={selectedProjectKeys}
                    onChange={(values) => setSelectedProjectKeys(values as string[])}
                    options={projects.map((p) => ({ label: `${p.name} (${p.key})`, value: p.key }))}
                  />
                </div>
              </>
            )}

            <Space style={{ marginTop: 16 }}>
              <Button type="primary" icon={<CloudSyncOutlined />} loading={savingAndSyncing} onClick={handleSaveAndSync}>
                Save & Sync Tasks
              </Button>
              <Button icon={<FolderOutlined />} loading={syncingProjects} onClick={handleSyncProjects}>
                Sync Projects
              </Button>
            </Space>

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Sync One Project
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              Pull every task for every member of a single Jira project right now — independent of the selection
              above. Any assignee with no matching employee gets a Developer/Junior account auto-created (guessed
              email, default temp password <code>{DEFAULT_TEMP_PASSWORD}</code> — review these before handing them
              out) so their tasks are picked up in the same run, skipping only bots/inactive Jira accounts. Issues
              with no assignee in Jira at all are synced too, under a shared "Unassigned (Jira)" placeholder
              employee — reassign these to their real owner afterward. If a task is assigned into a Jira sprint,
              that sprint is created here first (appended after any existing ones) and the task is assigned to it.
              Epic/User Story/Task/Bug/Sub-task issues are then given a matching taskCode (Epic-1, US-1.1,
              Task-1.1.1, Bug-1.1.1.1, SubTask-1.1.1.1) based on their Jira creation order.
            </Typography.Paragraph>
            <Space>
              <Select
                showSearch
                placeholder="Select a Jira project"
                style={{ width: 320 }}
                value={singleProjectKey}
                onChange={setSingleProjectKey}
                options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
                optionFilterProp="label"
              />
              <Button
                type="primary"
                icon={<CloudSyncOutlined />}
                loading={syncingSingleProject}
                disabled={!singleProjectKey}
                onClick={handleSyncSingleProject}
              >
                Sync This Project
              </Button>
            </Space>
            {singleProjectSyncResult && (
              <Alert
                style={{ marginTop: 12 }}
                type={singleProjectSyncResult.status === 'failed' ? 'error' : 'success'}
                showIcon
                message={`${singleProjectSyncResult.status}: ${singleProjectSyncResult.issuesFetched} fetched, ${singleProjectSyncResult.tasksCreated} created, ${singleProjectSyncResult.tasksUpdated} updated, ${singleProjectSyncResult.tasksSkipped} skipped (${singleProjectSyncResult.tasksWithoutAssignee ?? 0} with no owner mapped, synced anyway under the placeholder), ${singleProjectSyncResult.employeesCreated?.length ?? 0} employee(s) auto-created, ${singleProjectSyncResult.sprintsCreated ?? 0} sprint(s) created, ${singleProjectSyncResult.tasksAssignedToSprint ?? 0} task(s) assigned to a sprint, ${singleProjectSyncResult.taskCodesAssigned ?? 0} task code(s) assigned, ${singleProjectSyncResult.blockedByTaskIdsResolved ?? 0} task(s) got Blocked By resolved${singleProjectSyncResult.boardTypeDetected ? `, board type detected: ${singleProjectSyncResult.boardTypeDetected}` : ''}`}
                description={
                  <Space direction="vertical" size="small">
                    {singleProjectSyncResult.errorMessage && <span>{singleProjectSyncResult.errorMessage}</span>}
                    {singleProjectSyncResult.employeesCreated && singleProjectSyncResult.employeesCreated.length > 0 && (
                      <div>
                        <strong>Auto-created (Developer/Junior, password {DEFAULT_TEMP_PASSWORD} — review emails):</strong>
                        <ul style={{ marginBottom: 0 }}>
                          {singleProjectSyncResult.employeesCreated.map((e) => (
                            <li key={e.email}>
                              {e.fullName} — {e.email}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Space>
                }
              />
            )}

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              Create Task in Jira
            </Typography.Title>
            <Typography.Paragraph type="secondary">
              Creates a real issue directly on the team's Jira board — a live, visible write, not a local record.
              Run "Sync One Project" above afterward to pull it into this system.
            </Typography.Paragraph>

            <Typography.Text strong>Single task</Typography.Text>
            <Form form={createIssueForm} layout="vertical" style={{ marginTop: 8 }}>
              <Space style={{ width: '100%' }} wrap align="start">
                <Form.Item
                  name="projectKey"
                  label="Project"
                  rules={[{ required: true, message: 'Required' }]}
                  style={{ minWidth: 240 }}
                >
                  <Select
                    showSearch
                    placeholder="Select a Jira project"
                    options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item
                  name="issueType"
                  label="Issue type"
                  rules={[{ required: true, message: 'Required' }]}
                  initialValue="Task"
                  style={{ minWidth: 160 }}
                >
                  <Select options={JIRA_ISSUE_TYPES.map((t) => ({ value: t, label: t }))} />
                </Form.Item>
                <Form.Item name="storyPoints" label="Story points" style={{ minWidth: 120 }}>
                  <InputNumber min={0} style={{ width: '100%' }} />
                </Form.Item>
              </Space>
              <Form.Item name="summary" label="Summary" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Short issue title" />
              </Form.Item>
              <Space style={{ width: '100%' }} wrap align="start">
                <Form.Item name="assigneeAccountId" label="Assignee" style={{ minWidth: 240 }}>
                  <Select
                    allowClear
                    showSearch
                    placeholder="Unassigned"
                    options={jiraUsers
                      .filter((u) => u.active)
                      .map((u) => ({ value: u.accountId, label: stripCodePrefix(u.displayName) }))}
                    optionFilterProp="label"
                  />
                </Form.Item>
                <Form.Item
                  name="parentKey"
                  label="Parent (Epic/Story key)"
                  style={{ minWidth: 200 }}
                  extra="Sub-task always supported; Story/Task only nests under an Epic on team-managed projects"
                >
                  <Input placeholder="e.g. ABC-12" />
                </Form.Item>
              </Space>
              <Form.Item name="description" label="Description">
                <Input.TextArea rows={2} placeholder="Optional" />
              </Form.Item>
              <Button type="primary" icon={<PlusOutlined />} loading={creatingIssue} onClick={handleCreateIssue}>
                Create in Jira
              </Button>
            </Form>
            {createIssueResult && (
              <Alert
                style={{ marginTop: 12 }}
                type={createIssueResult.success ? 'success' : 'error'}
                showIcon
                message={
                  createIssueResult.success
                    ? `Created ${createIssueResult.issueKey} in ${createIssueResult.input.projectKey}`
                    : `Failed: ${createIssueResult.errorMessage}`
                }
              />
            )}

            <Divider />

            <Typography.Text strong>Bulk, from a CSV file</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ marginTop: 4 }}>
              Every row is created in the one project picked below — the file itself has no project column. Columns:{' '}
              <code>summary,issueType,assigneeAccountId,parentKey,storyPoints,description</code> — only{' '}
              <code>summary</code> and <code>issueType</code> are required. Rows are created one at a time; a failed
              row doesn't stop the rest.
            </Typography.Paragraph>
            <Space wrap align="start">
              <Select
                showSearch
                placeholder="Select a Jira project"
                style={{ width: 240 }}
                value={bulkProjectKey}
                onChange={setBulkProjectKey}
                options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
                optionFilterProp="label"
              />
              <Button icon={<FileAddOutlined />} onClick={downloadBulkCreateTemplate}>
                Download CSV template
              </Button>
              <Upload
                accept=".csv"
                maxCount={1}
                fileList={bulkFile ? [{ uid: '1', name: bulkFile.name }] : []}
                beforeUpload={(file) => {
                  setBulkFile(file);
                  return false;
                }}
                onRemove={() => setBulkFile(null)}
              >
                <Button icon={<UploadOutlined />}>Choose CSV file</Button>
              </Upload>
              <Button
                type="primary"
                icon={<CloudSyncOutlined />}
                loading={bulkUploading}
                disabled={!bulkFile || !bulkProjectKey}
                onClick={handleBulkCreateIssues}
              >
                Create Issues From File
              </Button>
            </Space>
            {bulkResults && (
              <Table
                style={{ marginTop: 12 }}
                rowKey={(_r, i) => String(i)}
                size="small"
                pagination={false}
                dataSource={bulkResults}
                columns={[
                  { title: 'Row', dataIndex: 'rowNumber' },
                  { title: 'Summary', render: (_, r: JiraCreateIssueResult) => r.input.summary },
                  {
                    title: 'Result',
                    render: (_, r: JiraCreateIssueResult) =>
                      r.success ? <Tag color="green">{r.issueKey}</Tag> : <Tag color="red">{r.errorMessage}</Tag>,
                  },
                ]}
              />
            )}

            <Divider />

            <Typography.Title level={5}>Push Project to Jira</Typography.Title>
            <Typography.Paragraph type="secondary">
              Pushes every task in a project from this system — Epics, User Stories, Tasks, Bugs, Sub-tasks — into a
              Jira project as real issues, preserving the Epic → Story → Task hierarchy (a task's Jira parent is set
              to its already-pushed Epic/Story). A task that already has a real Jira issue — e.g. it was originally
              synced from Jira — is left alone and reported as already in Jira, so this is safe to run more than
              once.
            </Typography.Paragraph>
            <Space wrap align="start">
              <Select
                showSearch
                placeholder="Project in this system"
                style={{ width: 260 }}
                value={pushLocalProjectName}
                onChange={setPushLocalProjectName}
                options={hierarchyProjects.map((p) => ({ value: p.projectName, label: p.projectName }))}
                optionFilterProp="label"
              />
              <Select
                showSearch
                placeholder="Target Jira project"
                style={{ width: 260 }}
                value={pushTargetJiraKey}
                onChange={setPushTargetJiraKey}
                options={projects.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
                optionFilterProp="label"
              />
              <Button
                type="primary"
                icon={<CloudSyncOutlined />}
                loading={pushing}
                disabled={!pushLocalProjectName || !pushTargetJiraKey}
                onClick={handlePushProjectToJira}
              >
                Push Tasks to Jira
              </Button>
            </Space>
            {pushResult && (
              <>
                <Alert
                  style={{ marginTop: 12 }}
                  type={pushResult.failed > 0 ? 'warning' : 'success'}
                  showIcon
                  message={`${pushResult.pushed} pushed, ${pushResult.alreadyInJira} already in Jira, ${pushResult.failed} failed (${pushResult.totalTasks} total tasks in "${pushResult.projectName}")`}
                />
                <Table
                  style={{ marginTop: 12 }}
                  rowKey={(_r, i) => String(i)}
                  size="small"
                  pagination={{ pageSize: 10 }}
                  dataSource={pushResult.rows}
                  columns={[
                    { title: 'Task', render: (_, r: JiraProjectPushRow) => r.taskCode ?? r.taskName },
                    { title: 'Type', render: (_, r: JiraProjectPushRow) => r.issueType ?? '—' },
                    {
                      title: 'Result',
                      render: (_, r: JiraProjectPushRow) => {
                        if (r.outcome === 'pushed') {
                          return <Tag color="green">Pushed: {r.jiraIssueKey}</Tag>;
                        }
                        if (r.outcome === 'already_in_jira') {
                          return <Tag color="blue">Already in Jira: {r.jiraIssueKey}</Tag>;
                        }
                        if (r.outcome === 'skipped_parent_failed') {
                          return <Tag>Skipped (parent failed)</Tag>;
                        }
                        return <Tag color="red">{r.errorMessage}</Tag>;
                      },
                    },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Card>

      {config?.configured && (
        <Card
          title={
            <Space>
              <PlusOutlined />
              Jira Users Needing an Employee Account
            </Space>
          }
          extra={
            <Button size="small" loading={loadingJiraUsers} onClick={loadJiraUsers}>
              Refresh Jira Users
            </Button>
          }
        >
          <Typography.Paragraph type="secondary">
            Active, real Jira accounts (bots/service accounts and inactive users are excluded) whose guessed email —
            derived from their name and your Jira domain (<code>@{emailDomain || '…'}</code>) — doesn't match any
            existing employee. Review/edit the email before creating; it's a guess, not a fact, since Jira doesn't
            expose other users' real email addresses.
          </Typography.Paragraph>
          <Table
            rowKey="accountId"
            size="small"
            loading={loadingJiraUsers}
            dataSource={newJiraUsers}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Jira user', render: (_, user) => stripCodePrefix(user.displayName) },
              { title: 'Guessed email', dataIndex: 'candidateEmail' },
              {
                title: 'Actions',
                render: (_, user: JiraUserSummary) => (
                  <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openCreateModal(user)}>
                    Quick Create
                  </Button>
                ),
              },
            ]}
          />
        </Card>
      )}

      <Card title="Recent Sync Runs">
        <Table
          rowKey="id"
          size="small"
          dataSource={logs}
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Started', render: (_, record: JiraSyncLog) => new Date(record.startedAt).toLocaleString() },
            {
              title: 'Status',
              render: (_, record: JiraSyncLog) => <Tag color={STATUS_COLOR[record.status]}>{record.status}</Tag>,
            },
            { title: 'Fetched', dataIndex: 'issuesFetched' },
            { title: 'Created', dataIndex: 'tasksCreated' },
            { title: 'Updated', dataIndex: 'tasksUpdated' },
            { title: 'Skipped', dataIndex: 'tasksSkipped' },
            { title: 'Error', render: (_, record: JiraSyncLog) => record.errorMessage ?? '—' },
          ]}
        />
      </Card>

      <Card
        title={
          <Space>
            <ApartmentOutlined />
            Project Task Hierarchy
          </Space>
        }
      >
        <Typography.Paragraph type="secondary">
          Read-only view of a project's Epic → User Story → Task config tree. Only Task issues carry real points —
          Epic/Story rows show the sum of their descendants' points instead.
        </Typography.Paragraph>
        <Select
          allowClear
          showSearch
          placeholder="Select a project"
          style={{ width: 320, marginBottom: 16 }}
          value={selectedHierarchyProject}
          onChange={handleSelectHierarchyProject}
          options={hierarchyProjects.map((p) => ({ value: p.projectName, label: p.projectName }))}
          optionFilterProp="label"
        />
        {selectedHierarchyProject && (
          <Table
            rowKey="id"
            size="small"
            loading={hierarchyLoading}
            dataSource={buildTaskHierarchy(hierarchyTasks)}
            pagination={{ pageSize: 10 }}
            columns={[
              {
                title: 'Task',
                render: (_, record: TaskTreeRow) => record.taskCode ?? record.taskName,
              },
              {
                title: 'Type',
                render: (_, record: TaskTreeRow) => <IssueTypeTag issueType={record.issueType} />,
              },
              { title: 'Employee', render: (_, record: TaskTreeRow) => record.employee.fullName },
              {
                title: 'Points',
                render: (_, record: TaskTreeRow) => (record.children ? record.rollupPoints : record.points),
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
                render: (_, record: TaskTreeRow) => record.completedAt ?? '—',
              },
            ]}
          />
        )}
      </Card>

      <Modal
        title={`Create employee for "${createTargetUser?.displayName}"`}
        open={createModalOpen}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={creatingEmployee}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="fullName" label="Full name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="firstname.lastname@company.com" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Temporary password"
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
            extra={`Default: ${DEFAULT_TEMP_PASSWORD} — change it if you'd rather set a different one.`}
          >
            <Input.Password placeholder={DEFAULT_TEMP_PASSWORD} />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="role" label="Role" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={employeeRoleOptions} />
            </Form.Item>
            <Form.Item name="level" label="Level" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={employeeLevelOptions} />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }}>
            <Form.Item name="levelEffectiveDate" label="Level effective date" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="joinDate" label="Join date" rules={[{ required: true }]}>
              <DatePicker />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
