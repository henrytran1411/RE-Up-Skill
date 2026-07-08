import { apiClient } from './apiClient';
import { PerformanceScorePeriod } from '../types/performance';

/** Performance Score (Technical Point + Contribution + Certificate points) per half-year period. */
export async function fetchMyPerformanceScoreHistory(): Promise<PerformanceScorePeriod[]> {
  const { data } = await apiClient.get<PerformanceScorePeriod[]>('/performance/me');
  return data;
}

export async function fetchPerformanceScoreHistoryForEmployee(employeeId: string): Promise<PerformanceScorePeriod[]> {
  const { data } = await apiClient.get<PerformanceScorePeriod[]>(`/performance/employee/${employeeId}`);
  return data;
}

export interface SnapshotPerformancePeriodPayload {
  year?: number;
  half?: 'H1' | 'H2';
  technicalPoint?: number;
  contributionPoints?: number;
  certificatePoints?: number;
}

/** Admin-only: freezes an employee's period — omit year/half for "current period", omit point fields to live-compute them. */
export async function snapshotPerformancePeriodForEmployee(
  employeeId: string,
  payload: SnapshotPerformancePeriodPayload = {},
): Promise<PerformanceScorePeriod> {
  const { data } = await apiClient.post<PerformanceScorePeriod>(`/performance/employee/${employeeId}/snapshot`, payload);
  return data;
}

/** Admin-only: closes out one period for every employee at once. */
export async function snapshotPerformancePeriodForAllEmployees(
  payload: { year?: number; half?: 'H1' | 'H2' } = {},
): Promise<{ count: number }> {
  const { data } = await apiClient.post<{ count: number }>('/performance/snapshot-all', payload);
  return data;
}
