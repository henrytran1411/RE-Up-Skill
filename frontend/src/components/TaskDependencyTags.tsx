import { Tag, Tooltip, Space } from 'antd';
import { TaskWithEmployee } from '../types/evaluation';

/** Renders a task's blockedByTaskIds as tags showing the blocking task's taskCode (falling back to its name). */
export function TaskDependencyTags({
  blockedByTaskIds,
  allTasks,
}: {
  readonly blockedByTaskIds: string[];
  readonly allTasks: TaskWithEmployee[];
}) {
  if (!blockedByTaskIds || blockedByTaskIds.length === 0) {
    return <span style={{ color: '#999' }}>—</span>;
  }
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  return (
    <Space size={4} wrap>
      {blockedByTaskIds.map((id) => {
        const task = byId.get(id);
        return (
          <Tooltip key={id} title={task ? task.taskName : 'Unknown task'}>
            <Tag color="red">{task ? task.taskCode ?? task.taskName : '?'}</Tag>
          </Tooltip>
        );
      })}
    </Space>
  );
}
