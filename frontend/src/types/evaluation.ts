import { EvaluationPeriod, EvaluationStatus } from './common';

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

export interface TaskRecord {
  id: string;
  employeeId: string;
  projectName: string;
  taskName: string;
  estimateHours: number;
  actualHours: number | null;
  complexity: number;
  points: number;
  pmRating: number | null;
  bugCount: number;
  completedAt: string | null;
  createdAt: string;
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
