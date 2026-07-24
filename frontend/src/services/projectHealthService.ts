import { apiClient } from './apiClient';
import { ProjectHealthReport, TaskCriticalPathReport } from '../types/projectHealth';

export async function fetchProjectHealth(projectName: string): Promise<ProjectHealthReport> {
  const { data } = await apiClient.get<ProjectHealthReport>(
    `/tasks/projects/${encodeURIComponent(projectName)}/health`,
  );
  return data;
}

/** Task-level critical path across every leaf task in the project — distinct from fetchProjectHealth's Epic-level one. */
export async function fetchTaskCriticalPath(projectName: string): Promise<TaskCriticalPathReport> {
  const { data } = await apiClient.get<TaskCriticalPathReport>(
    `/tasks/projects/${encodeURIComponent(projectName)}/critical-path-tasks`,
  );
  return data;
}
