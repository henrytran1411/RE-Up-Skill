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
}

export async function runJiraSync(): Promise<JiraSyncSummary> {
  const { data } = await apiClient.post<JiraSyncSummary>('/jira-sync/run', {});
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
