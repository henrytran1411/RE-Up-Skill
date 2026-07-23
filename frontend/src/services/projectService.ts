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

/** Sensitive — HR/Admin only. Used to prefill the ROI screen's inline rate editor. */
export async function fetchProjectContributionRate(projectName: string, employeeId: string): Promise<number | null> {
  const { data } = await apiClient.get<{ totalSalary: number | null }>(
    `/projects/${encodeURIComponent(projectName)}/contributions/${employeeId}`,
  );
  return data.totalSalary;
}

/** The only way a contribution rate is ever set — entered manually from the ROI screen, not the employee edit form. */
export async function setProjectContributionRate(
  projectName: string,
  employeeId: string,
  totalSalary: number,
): Promise<void> {
  await apiClient.put(`/projects/${encodeURIComponent(projectName)}/contributions/${employeeId}`, { totalSalary });
}
