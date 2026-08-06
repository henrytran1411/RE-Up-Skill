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

export const JIRA_ISSUE_TYPES = ['Task', 'Bug', 'Story', 'Epic', 'Sub-task'] as const;
export type JiraIssueType = (typeof JIRA_ISSUE_TYPES)[number];

export interface CreateJiraIssuePayload {
  projectKey: string;
  summary: string;
  issueType: JiraIssueType;
  assigneeAccountId?: string;
  parentKey?: string;
  storyPoints?: number;
  description?: string;
}

/** Outcome of one attempt to create an issue in real Jira — used for both the single-create form and each row of a bulk CSV upload. */
export interface JiraCreateIssueResult {
  success: boolean;
  issueKey: string | null;
  errorMessage: string | null;
  input: { projectKey: string; summary: string };
  /** Set only for bulk CSV rows — the 1-indexed row in the uploaded file (header row is row 1). */
  rowNumber?: number;
}

/** One local task's outcome when pushing a whole project to Jira. */
export interface JiraProjectPushRow {
  taskCode: string | null;
  taskName: string;
  issueType: string | null;
  outcome: 'pushed' | 'already_in_jira' | 'failed' | 'skipped_parent_failed';
  jiraIssueKey: string | null;
  errorMessage: string | null;
  /** Optional fields Jira rejected for this project/screen and that were dropped so the create could still succeed. */
  droppedFields?: string[];
}

export interface JiraProjectPushSummary {
  projectName: string;
  jiraProjectKey: string;
  totalTasks: number;
  pushed: number;
  alreadyInJira: number;
  failed: number;
  rows: JiraProjectPushRow[];
}

/** One already-in-Jira task's outcome when syncing its Summary out to the real Jira issue. */
export interface TaskSummarySyncRow {
  taskCode: string | null;
  taskName: string;
  jiraIssueKey: string;
  outcome: 'updated' | 'failed';
  errorMessage: string | null;
}

export interface TaskSummarySyncResult {
  projectName: string;
  jiraProjectKey: string;
  /** Tasks with no real Jira presence yet — not touched; push them to Jira first. */
  skipped: number;
  updated: number;
  failed: number;
  rows: TaskSummarySyncRow[];
}

/** One Epic or User Story already in a Jira project — used by the document-import flow's "list existing Epics/Stories" step. */
export interface JiraEpicOrStory {
  key: string;
  name: string;
  issueType: 'Epic' | 'Story';
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
