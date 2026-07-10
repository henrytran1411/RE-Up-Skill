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

/**
 * Completes a Microsoft sign-in: the backend already exchanged the OAuth
 * code and redirected here with a JWT — this stores it, then fetches the
 * employee's own profile (their apiClient calls now carry the token) to
 * populate the same `currentEmployee` shape a normal password login stores.
 */
export async function completeExternalLogin(accessToken: string): Promise<LoginResponse['employee']> {
  localStorage.setItem('accessToken', accessToken);
  const { data: profile } = await apiClient.get<Employee>('/employees/me');
  const employee: LoginResponse['employee'] = {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    role: profile.role,
    level: profile.level,
  };
  localStorage.setItem('currentEmployee', JSON.stringify(employee));
  return employee;
}

export function getStoredEmployee(): LoginResponse['employee'] | null {
  const raw = localStorage.getItem('currentEmployee');
  return raw ? JSON.parse(raw) : null;
}
