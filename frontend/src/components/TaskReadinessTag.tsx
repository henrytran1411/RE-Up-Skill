import { Tag } from 'antd';
import { TaskWithEmployee } from '../types/evaluation';
import { isTaskReady } from '../utils/taskReadiness';

/** Green "Ready" when a task has no blockers (or all of them are completed), else red "Not Ready". */
export function TaskReadinessTag({
  blockedByTaskIds,
  allTasks,
}: {
  readonly blockedByTaskIds: string[];
  readonly allTasks: TaskWithEmployee[];
}) {
  const ready = isTaskReady(blockedByTaskIds, allTasks);
  return <Tag color={ready ? 'green' : 'red'}>{ready ? 'Ready' : 'Not Ready'}</Tag>;
}
