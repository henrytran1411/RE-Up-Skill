import { apiClient } from './apiClient';
import { EmployeeSkill, Skill } from '../types/skill';
import { CompanyNeedLevel, SkillStatus, SkillTrack } from '../types/common';

export async function fetchAllSkills(): Promise<Skill[]> {
  const { data } = await apiClient.get<Skill[]>('/skills');
  return data;
}

export interface SkillCatalogPayload {
  name: string;
  category?: string;
  isKeySkill?: boolean;
  keySkillMultiplier?: number;
  companyNeedLevel?: CompanyNeedLevel;
  isFoundational?: boolean;
}

/** Master skill-catalog CRUD (name/category/flags) — distinct from employee skill-history entries below. */
export async function createSkill(payload: SkillCatalogPayload): Promise<Skill> {
  const { data } = await apiClient.post<Skill>('/skills', payload);
  return data;
}

export async function updateSkillCatalogEntry(id: string, payload: Partial<SkillCatalogPayload>): Promise<Skill> {
  const { data } = await apiClient.patch<Skill>(`/skills/catalog/${id}`, payload);
  return data;
}

export async function deleteSkillCatalogEntry(id: string): Promise<void> {
  await apiClient.delete(`/skills/catalog/${id}`);
}

export async function fetchMySkillMatrix(): Promise<EmployeeSkill[]> {
  const { data } = await apiClient.get<EmployeeSkill[]>('/skills/matrix/me');
  return data;
}

export async function fetchSkillMatrixForEmployee(employeeId: string): Promise<EmployeeSkill[]> {
  const { data } = await apiClient.get<EmployeeSkill[]>(`/skills/matrix/${employeeId}`);
  return data;
}

export async function fetchPendingSkillReviews(): Promise<EmployeeSkill[]> {
  const { data } = await apiClient.get<EmployeeSkill[]>('/skills/pending');
  return data;
}

export interface SkillHistoryFilters {
  employeeId?: string;
  skillId?: string;
  track?: SkillTrack;
  status?: SkillStatus;
  level?: string;
  search?: string;
}

export async function fetchSkillHistory(filters: SkillHistoryFilters = {}): Promise<EmployeeSkill[]> {
  const { data } = await apiClient.get<EmployeeSkill[]>('/skills/history', { params: filters });
  return data;
}

export interface DeclareSkillPayload {
  skillId: string;
  track: SkillTrack;
  proficiency: number;
  targetProficiency?: number;
  progressPercent?: number;
  /** Career level for this skill; required when track is CURRENT. */
  level?: string;
  startDate: string;
  endDate?: string;
}

export async function declareSkill(payload: DeclareSkillPayload): Promise<EmployeeSkill> {
  const { data } = await apiClient.post<EmployeeSkill>('/skills/declare', payload);
  return data;
}

/** PM/HR add a skill-history entry on behalf of another employee. */
export async function declareSkillForEmployee(
  employeeId: string,
  payload: DeclareSkillPayload,
): Promise<EmployeeSkill> {
  const { data } = await apiClient.post<EmployeeSkill>(`/skills/employees/${employeeId}`, payload);
  return data;
}

export async function verifyEmployeeSkill(employeeSkillId: string): Promise<EmployeeSkill> {
  const { data } = await apiClient.patch<EmployeeSkill>(`/skills/${employeeSkillId}/verify`);
  return data;
}

export async function confirmEmployeeSkill(employeeSkillId: string): Promise<EmployeeSkill> {
  const { data } = await apiClient.patch<EmployeeSkill>(`/skills/${employeeSkillId}/confirm`);
  return data;
}

/**
 * Marks this entry as the employee's primary skill within its category,
 * un-marking whatever else was primary there. Current-track entries only.
 */
export async function setPrimarySkill(employeeSkillId: string): Promise<EmployeeSkill> {
  const { data } = await apiClient.patch<EmployeeSkill>(`/skills/${employeeSkillId}/primary`);
  return data;
}

export async function updateSkillProgress(
  employeeSkillId: string,
  progressPercent: number,
  proficiency?: number,
): Promise<EmployeeSkill> {
  const { data } = await apiClient.patch<EmployeeSkill>(`/skills/${employeeSkillId}/progress`, {
    progressPercent,
    proficiency,
  });
  return data;
}

export interface UpdateEmployeeSkillPayload {
  proficiency?: number;
  targetProficiency?: number;
  progressPercent?: number;
  level?: string;
  startDate?: string;
  endDate?: string;
}

export async function updateEmployeeSkill(
  employeeSkillId: string,
  payload: UpdateEmployeeSkillPayload,
): Promise<EmployeeSkill> {
  const { data } = await apiClient.patch<EmployeeSkill>(`/skills/${employeeSkillId}`, payload);
  return data;
}

export async function deleteEmployeeSkill(employeeSkillId: string): Promise<void> {
  await apiClient.delete(`/skills/${employeeSkillId}`);
}
