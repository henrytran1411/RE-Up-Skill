import { apiClient } from './apiClient';
import { BenchLog, IdleBenchAlert, IdleLearningAlert } from '../types/bench';
import { BenchActivityType } from '../types/common';

export interface CreateBenchLogPayload {
  startDate: string;
  endDate?: string;
  activityType: BenchActivityType;
  description: string;
}

export async function createBenchLog(payload: CreateBenchLogPayload): Promise<BenchLog> {
  const { data } = await apiClient.post<BenchLog>('/bench-logs', payload);
  return data;
}

export async function fetchMyBenchLogs(): Promise<BenchLog[]> {
  const { data } = await apiClient.get<BenchLog[]>('/bench-logs/me');
  return data;
}

export async function fetchBenchLogsForEmployee(employeeId: string): Promise<BenchLog[]> {
  const { data } = await apiClient.get<BenchLog[]>(`/bench-logs/employee/${employeeId}`);
  return data;
}

export async function fetchIdleBenchAlerts(): Promise<IdleBenchAlert[]> {
  const { data } = await apiClient.get<IdleBenchAlert[]>('/bench-logs/alerts/idle');
  return data;
}

/** Self-facing "you're idle and not learning anything" warning — null when there's nothing to flag. */
export async function fetchMyIdleLearningAlert(): Promise<IdleLearningAlert | null> {
  const { data } = await apiClient.get<IdleLearningAlert | null>('/bench-logs/me/idle-learning-alert');
  return data;
}

export async function reviewBenchLog(id: string, outcomeScore: number): Promise<BenchLog> {
  const { data } = await apiClient.patch<BenchLog>(`/bench-logs/${id}/review`, { outcomeScore });
  return data;
}
