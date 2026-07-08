import { apiClient } from './apiClient';
import { TechnicalPointBreakdown } from '../types/technicalPoint';

/** T = A + B + C for every employee — see backend SkillsService#buildTechnicalPointBreakdown for the formula. */
export async function fetchAllTechnicalPoints(): Promise<TechnicalPointBreakdown[]> {
  const { data } = await apiClient.get<TechnicalPointBreakdown[]>('/skills/technical-point');
  return data;
}

export async function fetchMyTechnicalPoint(): Promise<TechnicalPointBreakdown> {
  const { data } = await apiClient.get<TechnicalPointBreakdown>('/skills/technical-point/me');
  return data;
}

export async function fetchTechnicalPointForEmployee(employeeId: string): Promise<TechnicalPointBreakdown> {
  const { data } = await apiClient.get<TechnicalPointBreakdown>(`/skills/technical-point/${employeeId}`);
  return data;
}
