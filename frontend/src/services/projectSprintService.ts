import { apiClient } from './apiClient';
import { ProjectSprint } from '../types/projectSprint';

export async function fetchSprintsForProject(projectName: string): Promise<ProjectSprint[]> {
  const { data } = await apiClient.get<ProjectSprint[]>(`/projects/${encodeURIComponent(projectName)}/sprints`);
  return data;
}

export interface ProjectSprintPayload {
  sprintNumber: number;
  name?: string;
  startDate: string;
  endDate: string;
}

export async function createSprint(projectName: string, payload: ProjectSprintPayload): Promise<ProjectSprint> {
  const { data } = await apiClient.post<ProjectSprint>(
    `/projects/${encodeURIComponent(projectName)}/sprints`,
    payload,
  );
  return data;
}

export async function updateSprint(
  projectName: string,
  id: string,
  payload: Partial<ProjectSprintPayload>,
): Promise<ProjectSprint> {
  const { data } = await apiClient.patch<ProjectSprint>(
    `/projects/${encodeURIComponent(projectName)}/sprints/${id}`,
    payload,
  );
  return data;
}

export async function deleteSprint(projectName: string, id: string): Promise<void> {
  await apiClient.delete(`/projects/${encodeURIComponent(projectName)}/sprints/${id}`);
}

/** Bulk-fills sequential 2-week sprints from the project's startDate through targetEndDate, skipping sprint numbers that already exist. */
export async function generateSprints(projectName: string): Promise<ProjectSprint[]> {
  const { data } = await apiClient.post<ProjectSprint[]>(
    `/projects/${encodeURIComponent(projectName)}/sprints/generate`,
    {},
  );
  return data;
}
