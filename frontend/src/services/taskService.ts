import { apiClient } from './apiClient';
import { TaskRecord, TaskWithEmployee } from '../types/evaluation';

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
  estimateHours: number;
  complexity: number;
  points: number;
  actualHours?: number;
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
