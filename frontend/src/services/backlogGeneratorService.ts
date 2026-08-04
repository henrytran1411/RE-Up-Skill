import { apiClient } from './apiClient';
import {
  BacklogGeneratorResult,
  GeneratedBacklog,
  GeneratedBacklogPushSummary,
  GeneratedEpic,
  MatchSuggestionResult,
} from '../types/backlogGenerator';

export interface GenerateBacklogPayload {
  projectName: string;
  description: string;
}

export async function generateBacklog(payload: GenerateBacklogPayload): Promise<BacklogGeneratorResult> {
  const { data } = await apiClient.post<BacklogGeneratorResult>('/backlog-generator/generate', payload);
  return data;
}

/** Extracts a .docx requirements document's Epics/User Stories via Gemini (one Task per Story) for review — nothing is saved locally. */
export async function previewBacklogFromDocument(file: File): Promise<GeneratedBacklog> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<GeneratedBacklog>('/backlog-generator/preview-from-document', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** Same as previewBacklogFromDocument, but the source is a real Jira issue — fetches its summary + description live via the saved Jira connection (any browse/board/issues URL shape, or a bare issue key). */
export async function previewBacklogFromJiraLink(jiraLink: string): Promise<GeneratedBacklog> {
  const { data } = await apiClient.post<GeneratedBacklog>('/backlog-generator/preview-from-jira-link', { jiraLink });
  return data;
}

/** Creates the given (reviewed) Epic/User Story/Task structure directly in Jira — a live, visible write. Admin-only on the backend. */
export async function pushGeneratedBacklogToJira(jiraProjectKey: string, epics: GeneratedEpic[]): Promise<GeneratedBacklogPushSummary> {
  const { data } = await apiClient.post<GeneratedBacklogPushSummary>('/backlog-generator/push-generated-to-jira', {
    jiraProjectKey,
    epics,
  });
  return data;
}

/** Compares the given Epics/User Stories against what already exists in jiraProjectKey, suggesting an existing item to reuse for each one that means the same thing. Read-only. */
export async function suggestExistingMatches(jiraProjectKey: string, epics: GeneratedEpic[]): Promise<MatchSuggestionResult> {
  const { data } = await apiClient.post<MatchSuggestionResult>('/backlog-generator/suggest-matches', {
    jiraProjectKey,
    epics,
  });
  return data;
}
