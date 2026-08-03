import { apiClient } from './apiClient';
import { BacklogGeneratorResult } from '../types/backlogGenerator';

export interface GenerateBacklogPayload {
  projectName: string;
  description: string;
}

export async function generateBacklog(payload: GenerateBacklogPayload): Promise<BacklogGeneratorResult> {
  const { data } = await apiClient.post<BacklogGeneratorResult>('/backlog-generator/generate', payload);
  return data;
}
