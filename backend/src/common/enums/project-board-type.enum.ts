/**
 * How a project runs its board in Jira — drives whether the Sprint tab is
 * shown at all (Kanban projects have no sprints to plan). Defaults to AGILE
 * so manually-created projects (not Jira-synced) keep the Sprint tab; a
 * Jira sync sets it explicitly based on whether the project's issues
 * actually carry Sprint field data.
 */
export enum ProjectBoardType {
  KANBAN = 'kanban',
  AGILE = 'agile',
}
