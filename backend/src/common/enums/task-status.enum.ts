/** Manually-set workflow status for a TaskRecord — distinct from completedAt, which the app keeps in sync with it (see TasksService). */
export enum TaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}
