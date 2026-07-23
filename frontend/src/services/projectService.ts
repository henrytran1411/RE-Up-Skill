import { apiClient } from './apiClient';
import { ProjectOverview, ProjectSummary, PublicProjectOverview } from '../types/project';

export async function fetchAllProjects(): Promise<ProjectSummary[]> {
  const { data } = await apiClient.get<ProjectSummary[]>('/tasks/projects');
  return data;
}

export async function fetchProjectOverview(projectName: string): Promise<ProjectOverview | PublicProjectOverview> {
  const { data } = await apiClient.get<ProjectOverview | PublicProjectOverview>(
    `/tasks/projects/${encodeURIComponent(projectName)}`,
  );
  return data;
}

export interface CreateProjectPayload {
  name: string;
  revenue?: number;
  managerId?: string;
  notes?: string;
  startDate?: string;
  targetEndDate?: string;
}

export async function createProject(payload: CreateProjectPayload): Promise<void> {
  await apiClient.post('/projects', payload);
}

export interface UpsertProjectPayload {
  /** Renames the project — cascades to every task record referencing the old name. */
  name?: string;
  revenue?: number;
  managerId?: string;
  notes?: string;
  startDate?: string;
  targetEndDate?: string;
}

export async function upsertProject(projectName: string, payload: UpsertProjectPayload): Promise<void> {
  await apiClient.put(`/projects/${encodeURIComponent(projectName)}`, payload);
}

export async function deleteProject(projectName: string): Promise<void> {
  await apiClient.delete(`/projects/${encodeURIComponent(projectName)}`);
}
