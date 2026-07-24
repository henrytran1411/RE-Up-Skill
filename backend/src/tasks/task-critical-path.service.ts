import { Injectable } from '@nestjs/common';
import { TaskRecord } from './entities/task-record.entity';

export interface CriticalPathTaskNode {
  id: string;
  taskCode: string | null;
  taskName: string;
  epicKey: string | null;
  epicName: string | null;
  points: number;
  completedAt: string | null;
}

export interface NonCriticalEpicGroup {
  epicKey: string | null;
  epicName: string;
  taskCount: number;
  totalEstimateHours: number;
}

export interface TaskCriticalPathReport {
  /** The longest blockedByTaskIds chain across every non-Epic/Story task in the project, in dependency order. */
  criticalPath: CriticalPathTaskNode[];
  criticalPathTotalPoints: number;
  criticalPathCompletedPoints: number;
  /** criticalPathCompletedPoints / criticalPathTotalPoints * 100, 0 when there's nothing on the path. */
  criticalPathPercentDone: number;
  allTasksTotalPoints: number;
  allTasksCompletedPoints: number;
  /** allTasksCompletedPoints / allTasksTotalPoints * 100 — every leaf task in the project, not just the critical path. */
  allTasksPercentDone: number;
  /** Leaf tasks NOT on the critical path, bucketed by their Epic — total estimate hours per Epic for the chart's bar series. */
  nonCriticalByEpic: NonCriticalEpicGroup[];
}

function percentOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

@Injectable()
export class TaskCriticalPathService {
  /**
   * Longest dependency chain of leaf tasks ending at `id` — mirrors
   * ProjectHealthService's Epic-level longestChainEndingAt, but weighted by
   * a task's own `points` instead of an Epic's estimatedSprintsNeeded.
   * `visiting` guards against a cycle in (presumably hand-authored) data.
   */
  private longestChainEndingAt(
    id: string,
    byId: Map<string, TaskRecord>,
    memo: Map<string, { total: number; path: string[] }>,
    visiting: Set<string>,
  ): { total: number; path: string[] } {
    const cached = memo.get(id);
    if (cached) {
      return cached;
    }
    const task = byId.get(id);
    if (!task || visiting.has(id)) {
      return { total: 0, path: [] };
    }

    visiting.add(id);
    let best = { total: task.points, path: [id] };
    for (const blockerId of task.blockedByTaskIds) {
      const chain = this.longestChainEndingAt(blockerId, byId, memo, visiting);
      const candidateTotal = chain.total + task.points;
      if (candidateTotal > best.total) {
        best = { total: candidateTotal, path: [...chain.path, id] };
      }
    }
    visiting.delete(id);
    memo.set(id, best);
    return best;
  }

  /**
   * Computes the project-wide task-level critical path — distinct from
   * ProjectHealthService's Epic-level one. Only leaf tasks (not Epic/Story
   * container issues, which always carry 0 points/estimateHours by this
   * team's convention) are graph nodes.
   */
  compute(tasks: TaskRecord[]): TaskCriticalPathReport {
    const nodes = tasks.filter((t) => t.issueType !== 'Epic' && t.issueType !== 'Story');
    const byId = new Map(nodes.map((t) => [t.id, t]));
    const epicNameByKey = new Map(
      tasks.filter((t) => t.issueType === 'Epic' && t.jiraIssueKey).map((e) => [e.jiraIssueKey as string, e.taskName]),
    );

    const memo = new Map<string, { total: number; path: string[] }>();
    let best = { total: 0, path: [] as string[] };
    for (const node of nodes) {
      const chain = this.longestChainEndingAt(node.id, byId, memo, new Set());
      if (chain.total > best.total) {
        best = chain;
      }
    }

    const criticalPathIds = new Set(best.path);
    const criticalPath: CriticalPathTaskNode[] = best.path.map((id) => {
      const t = byId.get(id) as TaskRecord;
      return {
        id: t.id,
        taskCode: t.taskCode,
        taskName: t.taskName,
        epicKey: t.epicKey,
        epicName: t.epicKey ? epicNameByKey.get(t.epicKey) ?? null : null,
        points: t.points,
        completedAt: t.completedAt,
      };
    });

    const criticalPathTotalPoints = criticalPath.reduce((sum, t) => sum + t.points, 0);
    const criticalPathCompletedPoints = criticalPath
      .filter((t) => t.completedAt !== null)
      .reduce((sum, t) => sum + t.points, 0);

    const allTasksTotalPoints = nodes.reduce((sum, t) => sum + t.points, 0);
    const allTasksCompletedPoints = nodes
      .filter((t) => t.completedAt !== null)
      .reduce((sum, t) => sum + t.points, 0);

    const groups = new Map<string, NonCriticalEpicGroup>();
    for (const t of nodes) {
      if (criticalPathIds.has(t.id)) {
        continue;
      }
      const key = t.epicKey ?? '__no_epic__';
      const group = groups.get(key) ?? {
        epicKey: t.epicKey,
        epicName: t.epicKey ? epicNameByKey.get(t.epicKey) ?? t.epicKey : 'No Epic',
        taskCount: 0,
        totalEstimateHours: 0,
      };
      group.taskCount += 1;
      group.totalEstimateHours += t.estimateHours;
      groups.set(key, group);
    }

    return {
      criticalPath,
      criticalPathTotalPoints,
      criticalPathCompletedPoints,
      criticalPathPercentDone: percentOf(criticalPathCompletedPoints, criticalPathTotalPoints),
      allTasksTotalPoints,
      allTasksCompletedPoints,
      allTasksPercentDone: percentOf(allTasksCompletedPoints, allTasksTotalPoints),
      nonCriticalByEpic: Array.from(groups.values()).sort((a, b) => b.totalEstimateHours - a.totalEstimateHours),
    };
  }
}
