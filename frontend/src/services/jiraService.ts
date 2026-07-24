import { apiClient } from './apiClient';
import { JiraConfigSummary, JiraProjectSummary, JiraProjectSyncSummary, JiraSyncLog, JiraUserSummary } from '../types/jira';

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
