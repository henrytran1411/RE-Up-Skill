import { EmployeeStatus, LevelHistorySource } from './common';

export interface Employee {
  id: string;
  fullName: string;
  email: string;
  /** Free text matching an EmployeeRole catalog entry's name — see the Admin page's Employee Roles panel. */
  role: string;
  /** Free text matching a SkillLevel catalog entry's name (e.g. "Junior", "Senior", "Expert"). */
  level: string;
  levelEffectiveDate: string;
  currentProject: string | null;
  /** Expected date this employee frees up from currentProject — meaningless once currentProject is null. */
  availableFrom: string | null;
  joinDate: string;
  isActive: boolean;
  /** Jira Cloud accountId this employee maps to, for the Jira task/user sync — see the Admin page's Jira Integration section. */
  jiraAccountId: string | null;
  /** Derived: ON_BENCH whenever currentProject is null. */
  status: EmployeeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LevelHistoryEntry {
  id: string;
  /** Null only for legacy rows predating the SkillLevel-catalog migration. */
  level: string | null;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  source: LevelHistorySource;
  setById: string | null;
  triggeredBySkillId: string | null;
}
