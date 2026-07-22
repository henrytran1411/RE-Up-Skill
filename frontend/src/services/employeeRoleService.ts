import { apiClient } from './apiClient';
import { EmployeeRole } from '../types/employeeRole';

export async function fetchAllEmployeeRoles(): Promise<EmployeeRole[]> {
  const { data } = await apiClient.get<EmployeeRole[]>('/employee-roles');
  return data;
}

export interface EmployeeRolePayload {
  name: string;
  sortOrder?: number;
}

export async function createEmployeeRole(payload: EmployeeRolePayload): Promise<EmployeeRole> {
  const { data } = await apiClient.post<EmployeeRole>('/employee-roles', payload);
  return data;
}

export async function updateEmployeeRole(id: string, payload: Partial<EmployeeRolePayload>): Promise<EmployeeRole> {
  const { data } = await apiClient.patch<EmployeeRole>(`/employee-roles/${id}`, payload);
  return data;
}

export async function deleteEmployeeRole(id: string): Promise<void> {
  await apiClient.delete(`/employee-roles/${id}`);
}
