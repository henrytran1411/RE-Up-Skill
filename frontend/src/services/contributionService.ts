import { apiClient } from './apiClient';
import { ContributionSource } from '../types/common';
import { ContributionRecord, ContributionYearSummary } from '../types/contribution';

export interface ContributionRecordPayload {
  employeeId: string;
  source: ContributionSource;
  points: number;
  recordDate: string;
  description: string;
}

/** Admin-only: every entry across every employee. */
export async function fetchAllContributionRecords(): Promise<ContributionRecord[]> {
  const { data } = await apiClient.get<ContributionRecord[]>('/contribution-records');
  return data;
}

export async function createContributionRecord(payload: ContributionRecordPayload): Promise<ContributionRecord> {
  const { data } = await apiClient.post<ContributionRecord>('/contribution-records', payload);
  return data;
}

export async function updateContributionRecord(
  id: string,
  payload: Partial<ContributionRecordPayload>,
): Promise<ContributionRecord> {
  const { data } = await apiClient.patch<ContributionRecord>(`/contribution-records/${id}`, payload);
  return data;
}

export async function deleteContributionRecord(id: string): Promise<void> {
  await apiClient.delete(`/contribution-records/${id}`);
}

export async function fetchMyContributionRecords(): Promise<ContributionRecord[]> {
  const { data } = await apiClient.get<ContributionRecord[]>('/contribution-records/me');
  return data;
}

export async function fetchMyContributionYearlySummary(): Promise<ContributionYearSummary[]> {
  const { data } = await apiClient.get<ContributionYearSummary[]>('/contribution-records/me/yearly');
  return data;
}

export async function fetchContributionRecordsForEmployee(employeeId: string): Promise<ContributionRecord[]> {
  const { data } = await apiClient.get<ContributionRecord[]>(`/contribution-records/employee/${employeeId}`);
  return data;
}

export async function fetchContributionYearlySummaryForEmployee(
  employeeId: string,
): Promise<ContributionYearSummary[]> {
  const { data } = await apiClient.get<ContributionYearSummary[]>(
    `/contribution-records/employee/${employeeId}/yearly`,
  );
  return data;
}
