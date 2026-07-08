import { apiClient } from './apiClient';
import { EmployeeTaskScore } from '../types/taskScore';

/** Task score (0-100) for every employee — see backend TasksService#findAllTaskScores. */
export async function fetchAllTaskScores(): Promise<EmployeeTaskScore[]> {
  const { data } = await apiClient.get<EmployeeTaskScore[]>('/tasks/task-score');
  return data;
}

export async function fetchMyTaskScore(): Promise<EmployeeTaskScore> {
  const { data } = await apiClient.get<EmployeeTaskScore>('/tasks/task-score/me');
  return data;
}

export async function fetchTaskScoreForEmployee(employeeId: string): Promise<EmployeeTaskScore> {
  const { data } = await apiClient.get<EmployeeTaskScore>(`/tasks/task-score/${employeeId}`);
  return data;
}

/** One entry per calendar year the employee has completed tasks in, oldest first. */
export async function fetchMyTaskScoreHistory(): Promise<EmployeeTaskScore[]> {
  const { data } = await apiClient.get<EmployeeTaskScore[]>('/tasks/task-score/me/history');
  return data;
}

export async function fetchTaskScoreHistoryForEmployee(employeeId: string): Promise<EmployeeTaskScore[]> {
  const { data } = await apiClient.get<EmployeeTaskScore[]>(`/tasks/task-score/${employeeId}/history`);
  return data;
}
