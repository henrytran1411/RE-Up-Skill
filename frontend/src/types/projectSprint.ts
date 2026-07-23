export interface ProjectSprint {
  id: string;
  projectName: string;
  sprintNumber: number;
  name: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  /** Jira's own sprint id when this row was synced from Jira rather than defined by hand — null for manually-created sprints. */
  jiraSprintId: number | null;
  createdAt: string;
  updatedAt: string;
}
