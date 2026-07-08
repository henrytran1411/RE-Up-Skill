import { apiClient } from './apiClient';
import { SkillLevel } from '../types/skillLevel';

export async function fetchAllSkillLevels(): Promise<SkillLevel[]> {
  const { data } = await apiClient.get<SkillLevel[]>('/skill-levels');
  return data;
}

export interface SkillLevelPayload {
  name: string;
  weight: number;
}

export async function createSkillLevel(payload: SkillLevelPayload): Promise<SkillLevel> {
  const { data } = await apiClient.post<SkillLevel>('/skill-levels', payload);
  return data;
}

export async function updateSkillLevel(id: string, payload: Partial<SkillLevelPayload>): Promise<SkillLevel> {
  const { data } = await apiClient.patch<SkillLevel>(`/skill-levels/${id}`, payload);
  return data;
}

export async function deleteSkillLevel(id: string): Promise<void> {
  await apiClient.delete(`/skill-levels/${id}`);
}
