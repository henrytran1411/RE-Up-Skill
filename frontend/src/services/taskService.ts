import { apiClient } from './apiClient';
import { TaskRecord, TaskWithEmployee } from '../types/evaluation';
import { TaskStatus } from '../types/common';

export async function fetchTasksForProject(projectName: string): Promise<TaskWithEmployee[]> {
  const { data } = await apiClient.get<TaskWithEmployee[]>(
    `/tasks/projects/${encodeURIComponent(projectName)}/tasks`,
  );
  return data;
}

export interface CreateTaskPayload {
  employeeId: string;
  projectName: string;
  taskName: string;
  /** Free-text detail — also where a synced Jira issue's own description will land once Jira sync is extended to write it. */
  description?: string;
  /** Hierarchy code shown in Task Management instead of the title — e.g. "Epic-1", "US-1.1", "Task-1.1.1", "SubTask-1.1.1.1". */
  taskCode?: string;
  estimateHours: number;
  complexity: number;
  points: number;
  actualHours?: number;
  /** Which project sprint (see /projects/:name/sprints) this task is assigned to — set manually, not synced from Jira. */
  projectSprintId?: string;
  /** Other task ids (in this same project) that must finish before this one can — drives the task-level critical path. */
  blockedByTaskIds?: string[];
  /** Workflow status. Setting COMPLETED without completedAt auto-stamps today; setting TODO/IN_PROGRESS clears completedAt server-side. */
  status?: TaskStatus;
}

export async function createTask(payload: CreateTaskPayload): Promise<TaskRecord> {
  const { data } = await apiClient.post<TaskRecord>('/tasks', payload);
  return data;
}

export type UpdateTaskPayload = Partial<CreateTaskPayload> & {
  bugCount?: number;
  pmRating?: number;
  completedAt?: string;
};

export async function updateTask(id: string, payload: UpdateTaskPayload): Promise<TaskRecord> {
  const { data } = await apiClient.patch<TaskRecord>(`/tasks/${id}`, payload);
  return data;
}

export async function deleteTask(id: string): Promise<void> {
  await apiClient.delete(`/tasks/${id}`);
}

/** Sets which other Epics (by their own jiraIssueKey) must finish before this one can — drives the critical-path calculation. */
export async function setEpicDependencies(taskId: string, blockedByEpicKeys: string[]): Promise<TaskRecord> {
  const { data } = await apiClient.patch<TaskRecord>(`/tasks/${taskId}/epic-dependencies`, { blockedByEpicKeys });
  return data;
}

/** Prepends [Epic/US/Task/Bug/ReOpen/Enhance/CR-x.x.x] to any task's summary in the project that doesn't already have a recognized prefix, using that task's own taskCode. */
export async function syncTaskNamePrefixes(projectName: string): Promise<{ updatedCount: number }> {
  const { data } = await apiClient.post<{ updatedCount: number }>(
    `/tasks/projects/${encodeURIComponent(projectName)}/sync-task-name-prefixes`,
  );
  return data;
}
