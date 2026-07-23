import { apiClient } from './apiClient';
import { ProjectNote } from '../types/projectNote';

export async function fetchNotesForProject(projectName: string): Promise<ProjectNote[]> {
  const { data } = await apiClient.get<ProjectNote[]>(`/projects/${encodeURIComponent(projectName)}/notes`);
  return data;
}

export async function createProjectNote(projectName: string, content: string): Promise<ProjectNote> {
  const { data } = await apiClient.post<ProjectNote>(`/projects/${encodeURIComponent(projectName)}/notes`, {
    content,
  });
  return data;
}

export async function updateProjectNote(projectName: string, id: string, content: string): Promise<ProjectNote> {
  const { data } = await apiClient.patch<ProjectNote>(`/projects/${encodeURIComponent(projectName)}/notes/${id}`, {
    content,
  });
  return data;
}

export async function deleteProjectNote(projectName: string, id: string): Promise<void> {
  await apiClient.delete(`/projects/${encodeURIComponent(projectName)}/notes/${id}`);
}
