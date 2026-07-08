import { apiClient } from './apiClient';
import { CertificateYearSummary, EmployeeCertificate } from '../types/certificate';

export interface CertificatePayload {
  name: string;
  description?: string;
  imageUrl: string;
  expiredDate: string;
}

export async function uploadCertificateImage(file: File): Promise<{ imageUrl: string }> {
  const formData = new FormData();
  formData.append('image', file);
  const { data } = await apiClient.post<{ imageUrl: string }>('/certificates/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function createCertificate(payload: CertificatePayload): Promise<EmployeeCertificate> {
  const { data } = await apiClient.post<EmployeeCertificate>('/certificates', payload);
  return data;
}

export async function updateCertificate(
  id: string,
  payload: Partial<CertificatePayload>,
): Promise<EmployeeCertificate> {
  const { data } = await apiClient.patch<EmployeeCertificate>(`/certificates/${id}`, payload);
  return data;
}

export async function deleteCertificate(id: string): Promise<void> {
  await apiClient.delete(`/certificates/${id}`);
}

export async function verifyCertificate(id: string, points: number): Promise<EmployeeCertificate> {
  const { data } = await apiClient.patch<EmployeeCertificate>(`/certificates/${id}/verify`, { points });
  return data;
}

export async function fetchMyCertificates(): Promise<EmployeeCertificate[]> {
  const { data } = await apiClient.get<EmployeeCertificate[]>('/certificates/me');
  return data;
}

export async function fetchMyCertificateYearlySummary(): Promise<CertificateYearSummary[]> {
  const { data } = await apiClient.get<CertificateYearSummary[]>('/certificates/me/yearly');
  return data;
}

/** Admin-only: every certificate across every employee. */
export async function fetchAllCertificates(): Promise<EmployeeCertificate[]> {
  const { data } = await apiClient.get<EmployeeCertificate[]>('/certificates');
  return data;
}

/** Admin-only: awaiting verification. */
export async function fetchPendingCertificates(): Promise<EmployeeCertificate[]> {
  const { data } = await apiClient.get<EmployeeCertificate[]>('/certificates/pending');
  return data;
}

export async function fetchCertificatesForEmployee(employeeId: string): Promise<EmployeeCertificate[]> {
  const { data } = await apiClient.get<EmployeeCertificate[]>(`/certificates/employee/${employeeId}`);
  return data;
}

export async function fetchCertificateYearlySummaryForEmployee(
  employeeId: string,
): Promise<CertificateYearSummary[]> {
  const { data } = await apiClient.get<CertificateYearSummary[]>(`/certificates/employee/${employeeId}/yearly`);
  return data;
}
