import { TaskWithEmployee } from '../types/evaluation';

/** A task is Ready when it has no blockers, or every task blocking it is completed; otherwise Not Ready. */
export function isTaskReady(blockedByTaskIds: string[], allTasks: TaskWithEmployee[]): boolean {
  if (!blockedByTaskIds || blockedByTaskIds.length === 0) {
    return true;
  }
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  return blockedByTaskIds.every((id) => byId.get(id)?.completedAt != null);
}
