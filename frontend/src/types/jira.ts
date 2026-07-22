export interface JiraConfigSummary {
  configured: boolean;
  baseUrl: string | null;
  email: string | null;
  projectKeys: string[];
  syncAllProjects: boolean;
  storyPointsField: string | null;
  updatedAt: string | null;
}

export interface JiraProjectSummary {
  id: string;
  key: string;
  name: string;
}

export interface JiraProjectSyncSummary {
  status: 'success' | 'partial' | 'failed' | 'skipped';
  projectsFetched: number;
  projectsCreated: number;
  projectsUpdated: number;
  errorMessage: string | null;
}

export interface JiraUserSummary {
  accountId: string;
  displayName: string;
  active: boolean;
  /** 'atlassian' = a real person; 'app'/'customer' etc. are bots/service accounts. */
  accountType: string;
}

export interface JiraSyncLog {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  issuesFetched: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksSkipped: number;
  errorMessage: string | null;
  unmatchedAssignees: string | null;
}
