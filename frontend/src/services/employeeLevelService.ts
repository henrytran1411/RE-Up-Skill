import { apiClient } from './apiClient';
import { EmployeeLevel } from '../types/employeeLevel';

export async function fetchAllEmployeeLevels(): Promise<EmployeeLevel[]> {
  const { data } = await apiClient.get<EmployeeLevel[]>('/employee-levels');
  return data;
}

export interface EmployeeLevelPayload {
  name: string;
  sortOrder?: number;
}

export async function createEmployeeLevel(payload: EmployeeLevelPayload): Promise<EmployeeLevel> {
  const { data } = await apiClient.post<EmployeeLevel>('/employee-levels', payload);
  return data;
}

export async function updateEmployeeLevel(id: string, payload: Partial<EmployeeLevelPayload>): Promise<EmployeeLevel> {
  const { data } = await apiClient.patch<EmployeeLevel>(`/employee-levels/${id}`, payload);
  return data;
}

export async function deleteEmployeeLevel(id: string): Promise<void> {
  await apiClient.delete(`/employee-levels/${id}`);
}
