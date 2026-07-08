import { apiClient } from './apiClient';
import { Employee } from '../types/employee';

export interface LoginResponse {
  accessToken: string;
  employee: Pick<Employee, 'id' | 'fullName' | 'email' | 'role' | 'level'>;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('currentEmployee', JSON.stringify(data.employee));
  return data;
}

export function logout(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('currentEmployee');
}

export function getStoredEmployee(): LoginResponse['employee'] | null {
  const raw = localStorage.getItem('currentEmployee');
  return raw ? JSON.parse(raw) : null;
}
