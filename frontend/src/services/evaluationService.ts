import { apiClient } from './apiClient';
import { Evaluation, ProjectHistoryEntry, TaskRecord } from '../types/evaluation';

export async function fetchMyEvaluations(): Promise<Evaluation[]> {
  const { data } = await apiClient.get<Evaluation[]>('/evaluations/me');
  return data;
}

export async function fetchEvaluationsForEmployee(employeeId: string): Promise<Evaluation[]> {
  const { data } = await apiClient.get<Evaluation[]>(`/evaluations/employee/${employeeId}`);
  return data;
}

export async function fetchMyTasks(): Promise<TaskRecord[]> {
  const { data } = await apiClient.get<TaskRecord[]>('/tasks/me');
  return data;
}

export async function fetchMyProjectHistory(): Promise<ProjectHistoryEntry[]> {
  const { data } = await apiClient.get<ProjectHistoryEntry[]>('/tasks/me/project-history');
  return data;
}

export async function fetchProjectHistoryForEmployee(employeeId: string): Promise<ProjectHistoryEntry[]> {
  const { data } = await apiClient.get<ProjectHistoryEntry[]>(`/tasks/employee/${employeeId}/project-history`);
  return data;
}
