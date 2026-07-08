import { apiClient } from './apiClient';
import { SkillCategory } from '../types/skillCategory';

export async function fetchAllSkillCategories(): Promise<SkillCategory[]> {
  const { data } = await apiClient.get<SkillCategory[]>('/skill-categories');
  return data;
}

export interface SkillCategoryPayload {
  name: string;
  description?: string;
  primaryWeight?: number;
  secondaryWeight?: number;
  priority?: number;
}

export async function createSkillCategory(payload: SkillCategoryPayload): Promise<SkillCategory> {
  const { data } = await apiClient.post<SkillCategory>('/skill-categories', payload);
  return data;
}

/** `name` here renames the category and cascades to every skill referencing the old name. */
export async function updateSkillCategory(
  id: string,
  payload: Partial<SkillCategoryPayload>,
): Promise<SkillCategory> {
  const { data } = await apiClient.patch<SkillCategory>(`/skill-categories/${id}`, payload);
  return data;
}

export async function deleteSkillCategory(id: string): Promise<void> {
  await apiClient.delete(`/skill-categories/${id}`);
}
