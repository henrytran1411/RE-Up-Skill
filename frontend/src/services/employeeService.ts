import { apiClient } from './apiClient';
import { Employee, LevelHistoryEntry } from '../types/employee';
import { EmployeeStatus } from '../types/common';

export async function fetchMyProfile(): Promise<Employee> {
  const { data } = await apiClient.get<Employee>('/employees/me');
  return data;
}

export async function fetchMyLevelHistory(): Promise<LevelHistoryEntry[]> {
  const { data } = await apiClient.get<LevelHistoryEntry[]>('/employees/me/level-history');
  return data;
}

export async function fetchEmployeeLevelHistory(employeeId: string): Promise<LevelHistoryEntry[]> {
  const { data } = await apiClient.get<LevelHistoryEntry[]>(`/employees/${employeeId}/level-history`);
  return data;
}

export interface EmployeeSearchFilters {
  search?: string;
  level?: string;
  role?: string;
  status?: EmployeeStatus;
  isActive?: boolean;
}

export async function fetchAllEmployees(filters: EmployeeSearchFilters = {}): Promise<Employee[]> {
  const { data } = await apiClient.get<Employee[]>('/employees', {
    params: {
      ...filters,
      isActive: filters.isActive === undefined ? undefined : String(filters.isActive),
    },
  });
  return data;
}

export async function fetchEmployee(id: string): Promise<Employee> {
  const { data } = await apiClient.get<Employee>(`/employees/${id}`);
  return data;
}

export interface CreateEmployeePayload {
  fullName: string;
  email: string;
  password: string;
  /** A name from the EmployeeRole catalog — see the Admin page's Employee Roles panel. */
  role?: string;
  level: string;
  levelEffectiveDate: string;
  joinDate: string;
  currentProject?: string;
  /** Expected date this employee frees up from currentProject — for capacity planning. */
  availableFrom?: string;
  /** Jira Cloud accountId this employee maps to — see the Admin page's Jira Integration section. */
  jiraAccountId?: string;
}

/** Sensitive — HR/Admin only. Used to prefill the ROI screen's inline salary editor. */
export async function fetchEmployeeSalary(id: string): Promise<number | null> {
  const { data } = await apiClient.get<{ monthlySalary: number | null }>(`/employees/${id}/salary`);
  return data.monthlySalary;
}

/** The only way salary is ever set — entered manually from the ROI screen, not the employee edit form. */
export async function setEmployeeSalary(id: string, monthlySalary: number): Promise<void> {
  await apiClient.put(`/employees/${id}/salary`, { monthlySalary });
}

export async function createEmployee(payload: CreateEmployeePayload): Promise<Employee> {
  const { data } = await apiClient.post<Employee>('/employees', payload);
  return data;
}

export type UpdateEmployeePayload = Partial<Omit<CreateEmployeePayload, 'password'>>;

export async function updateEmployee(id: string, payload: UpdateEmployeePayload): Promise<Employee> {
  const { data } = await apiClient.patch<Employee>(`/employees/${id}`, payload);
  return data;
}

export async function deleteEmployee(id: string): Promise<void> {
  await apiClient.delete(`/employees/${id}`);
}
