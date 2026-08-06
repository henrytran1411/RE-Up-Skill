import { apiClient } from './apiClient';
import {
  CreateJiraIssuePayload,
  JiraConfigSummary,
  JiraCreateIssueResult,
  JiraEpicOrStory,
  JiraProjectPushSummary,
  JiraProjectSummary,
  JiraProjectSyncSummary,
  JiraSyncLog,
  JiraUserSummary,
  TaskSummarySyncResult,
  TaskSummarySyncRow,
} from '../types/jira';
import { ProjectBoardType } from '../types/common';

export async function fetchJiraConfig(): Promise<JiraConfigSummary> {
  const { data } = await apiClient.get<JiraConfigSummary>('/jira-sync/config');
  return data;
}

export interface UpsertJiraConfigPayload {
  baseUrl: string;
  email: string;
  /** Omit to keep the currently-stored token unchanged. Required the first time. */
  apiToken?: string;
  /** Omit to leave the current project selection untouched; send [] to clear it. Ignored when syncAllProjects is true. */
  projectKeys?: string[];
  /** When true, every sync pulls every project the account can see, ignoring projectKeys. Omit to leave the current mode untouched. */
  syncAllProjects?: boolean;
  storyPointsField?: string;
}

export async function upsertJiraConfig(payload: UpsertJiraConfigPayload): Promise<void> {
  await apiClient.put('/jira-sync/config', payload);
}

export async function fetchJiraProjects(): Promise<JiraProjectSummary[]> {
  const { data } = await apiClient.get<JiraProjectSummary[]>('/jira-sync/projects');
  return data;
}

export interface JiraSyncSummary {
  status: 'success' | 'partial' | 'failed' | 'skipped';
  issuesFetched: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksSkipped: number;
  errorMessage: string | null;
  unmatchedAssignees: { accountId: string; displayName: string; issueCount: number }[];
  /** Set only by runJiraSingleProjectSync — how many rows got a fresh taskCode afterward. */
  taskCodesAssigned?: number;
  /** Set only by runJiraSingleProjectSync — employee accounts auto-created for previously-unmatched assignees. Each has the default temp password and a best-effort guessed email — review before handing out. */
  employeesCreated?: { fullName: string; email: string }[];
  /** Set only by runJiraSingleProjectSync — new ProjectSprint rows created from Jira's own Sprint field. */
  sprintsCreated?: number;
  /** Set only by runJiraSingleProjectSync — how many synced tasks got a projectSprintId from Jira's own Sprint field. */
  tasksAssignedToSprint?: number;
  /** Set only by runJiraSingleProjectSync — issues synced under the shared "Unassigned (Jira)" placeholder employee instead of being skipped: no assignee in Jira at all, an assignee not yet mapped to an Employee, or an inactive/deactivated Jira account. Reassign these to the real owner once known — see unmatchedAssignees for who. */
  tasksWithoutAssignee?: number;
  /** Set only by runJiraSingleProjectSync — how many tasks got blockedByTaskIds resolved from Jira's own "is blocked by" issue links (a task can be blocked by more than one other task). */
  blockedByTaskIdsResolved?: number;
  /** Set only by runJiraSingleProjectSync — how many Tasks with Sub-tasks had their own estimateHours/actualHours/points zeroed out (rolled up onto instead, like Epic/Story). */
  taskRollupsRecalculated?: number;
  /** Set only by runJiraSingleProjectSync, when the Sprint field could be resolved — the Project's board type as detected from whether any fetched issue actually carries Sprint data. KANBAN hides the Sprint tab. */
  boardTypeDetected?: ProjectBoardType;
}

export async function runJiraSync(): Promise<JiraSyncSummary> {
  const { data } = await apiClient.post<JiraSyncSummary>('/jira-sync/run', {});
  return data;
}

/** Syncs exactly one Jira project by key, independent of the stored project selection, then recomputes taskCode for every issue in it. */
export async function runJiraSingleProjectSync(projectKey: string): Promise<JiraSyncSummary> {
  const { data } = await apiClient.post<JiraSyncSummary>(`/jira-sync/run/${encodeURIComponent(projectKey)}`, {});
  return data;
}

export async function runJiraProjectSync(): Promise<JiraProjectSyncSummary> {
  const { data } = await apiClient.post<JiraProjectSyncSummary>('/jira-sync/run-projects', {});
  return data;
}

export async function fetchJiraSyncLogs(): Promise<JiraSyncLog[]> {
  const { data } = await apiClient.get<JiraSyncLog[]>('/jira-sync/logs');
  return data;
}

export async function fetchJiraUsers(): Promise<JiraUserSummary[]> {
  const { data } = await apiClient.get<JiraUserSummary[]>('/jira-sync/users');
  return data;
}

/** Creates one brand-new issue directly in real Jira — a live, visible write, unlike every read above. */
export async function createJiraIssue(payload: CreateJiraIssuePayload): Promise<JiraCreateIssueResult> {
  const { data } = await apiClient.post<JiraCreateIssueResult>('/jira-sync/create-issue', payload);
  return data;
}

/** Bulk-creates issues, all in the given project, from a CSV file (columns: summary,issueType,assigneeAccountId,parentKey,storyPoints,description). */
export async function createJiraIssuesBulk(projectKey: string, file: File): Promise<JiraCreateIssueResult[]> {
  const formData = new FormData();
  formData.append('projectKey', projectKey);
  formData.append('file', file);
  const { data } = await apiClient.post<JiraCreateIssueResult[]>('/jira-sync/create-issues-bulk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Pushes every task in a local Project that isn't already in Jira into jiraProjectKey as real issues — a live, visible write. */
export async function pushProjectToJira(projectName: string, jiraProjectKey: string): Promise<JiraProjectPushSummary> {
  const { data } = await apiClient.post<JiraProjectPushSummary>('/jira-sync/push-project', { projectName, jiraProjectKey });
  return data;
}

/** Every Epic and User Story already in a Jira project — read-only. */
export async function fetchJiraEpicsAndStories(jiraProjectKey: string): Promise<JiraEpicOrStory[]> {
  const { data } = await apiClient.get<JiraEpicOrStory[]>(`/jira-sync/projects/${encodeURIComponent(jiraProjectKey)}/epics-and-stories`);
  return data;
}

/** Pushes every already-in-Jira task's current local Summary out to its real Jira issue — the project must already be mapped to a Jira project via setProjectJiraMapping. */
export async function syncTaskSummariesToJira(projectName: string): Promise<TaskSummarySyncResult> {
  const { data } = await apiClient.post<TaskSummarySyncResult>(
    `/jira-sync/projects/${encodeURIComponent(projectName)}/sync-task-summaries`,
  );
  return data;
}

/** Same rule as syncTaskSummariesToJira, for exactly one task — the Task Management table's per-row "Sync to Jira" action. */
export async function syncOneTaskSummaryToJira(taskId: string): Promise<TaskSummarySyncRow> {
  const { data } = await apiClient.post<TaskSummarySyncRow>(`/jira-sync/tasks/${taskId}/sync-summary`);
  return data;
}
