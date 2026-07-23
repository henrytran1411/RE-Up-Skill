import { apiClient } from './apiClient';
import { ProjectHealthReport } from '../types/projectHealth';

export async function fetchProjectHealth(projectName: string): Promise<ProjectHealthReport> {
  const { data } = await apiClient.get<ProjectHealthReport>(
    `/tasks/projects/${encodeURIComponent(projectName)}/health`,
  );
  return data;
}
