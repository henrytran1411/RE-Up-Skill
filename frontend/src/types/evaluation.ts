import { EvaluationPeriod, EvaluationStatus, TaskStatus } from './common';

export interface Evaluation {
  id: string;
  employeeId: string;
  period: EvaluationPeriod;
  periodStart: string;
  periodEnd: string;
  levelBreakdown: { level: string; fraction: number }[];
  taskScore: number;
  skillScore: number;
  softSkillScore: number;
  benchScore: number;
  totalScore: number;
  status: EvaluationStatus;
  reviewerId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One Jira issue (usually a Bug) that blocks a task, captured from Jira's "is blocked by" issue links. */
export interface BlockedByIssueRef {
  key: string;
  summary: string | null;
  issueType: string | null;
}

export interface TaskRecord {
  id: string;
  employeeId: string;
  projectName: string;
  taskName: string;
  /** Hierarchy code shown in Task Management instead of the title — e.g. "Epic-1", "US-1.1", "Task-1.1.1", "SubTask-1.1.1.1". Null falls back to showing the title. */
  taskCode: string | null;
  estimateHours: number;
  actualHours: number | null;
  complexity: number;
  points: number;
  pmRating: number | null;
  bugCount: number;
  /** Workflow status — kept in sync with completedAt by the backend (COMPLETED stamps it, TODO/IN_PROGRESS clears it). */
  status: TaskStatus;
  completedAt: string | null;
  createdAt: string;
  jiraIssueKey: string | null;
  /** Jira issue type (e.g. "Task", "Bug", "Story") — null for tasks not created via Jira sync. */
  issueType: string | null;
  /** Other Jira issues (usually bugs) that block this one — empty when none or not Jira-synced. */
  blockedByIssues: BlockedByIssueRef[];
  /** Other task ids (in this same project) that must finish before this one can — drives the task-level critical path, shown by taskCode. */
  blockedByTaskIds: string[];
  /** Which project sprint (see /projects/:name/sprints) this task is assigned to — set manually, not synced from Jira. */
  projectSprintId: string | null;
  /** Every sprint (by id) this task has ever been assigned to, oldest first — projectSprintId is just the last entry. Populated from Jira's own multi-entry Sprint field during sync; empty for manually-created tasks. length > 1 means it carried over at least once. */
  sprintHistoryIds: string[];
  /** The Epic this issue ultimately belongs to (that Epic's own jiraIssueKey) — null for the Epic issue itself and for issues with no Epic. */
  epicKey: string | null;
  /** The User Story this Task/Bug/Sub-task's immediate parent is (that Story's own jiraIssueKey) — null for Epics, Stories themselves, and leaves linked directly to an Epic with no Story in between. */
  storyKey: string | null;
}

/** What `GET /tasks/projects/:projectName/tasks` returns — a task with its assignee joined in. */
export interface TaskWithEmployee extends TaskRecord {
  employee: { id: string; fullName: string };
}

export interface ProjectHistoryEntry {
  projectName: string;
  tasks: TaskRecord[];
  employeePoints: number;
  totalProjectPoints: number;
  effortPercent: number;
  /** Earliest createdAt among this employee's tasks on this project. */
  startDate: string;
  /** Latest completedAt, only once every one of this employee's tasks on this project is done; null while still in progress. */
  endDate: string | null;
}
