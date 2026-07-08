/**
 * Derived, not stored — computed from a project's task completion counts.
 * No tasks done yet (or no tasks at all) is PENDING; some but not all done is
 * PROCESSING; every task done is COMPLETED. See computeProjectStatus in
 * tasks.service.ts.
 */
export enum ProjectStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}
