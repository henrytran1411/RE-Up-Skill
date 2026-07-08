import { apiClient } from './apiClient';
import { SkillGapSuggestion } from '../types/skillSuggestion';

/** Categories this employee has zero skill history in, sorted by priority high to low. */
export async function fetchMySkillSuggestions(): Promise<SkillGapSuggestion[]> {
  const { data } = await apiClient.get<SkillGapSuggestion[]>('/skills/suggestions/me');
  return data;
}

export async function fetchSkillSuggestionsForEmployee(employeeId: string): Promise<SkillGapSuggestion[]> {
  const { data } = await apiClient.get<SkillGapSuggestion[]>(`/skills/suggestions/${employeeId}`);
  return data;
}
