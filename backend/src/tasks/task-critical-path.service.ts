import { Injectable } from '@nestjs/common';
import { TaskRecord } from './entities/task-record.entity';

/** One task in a blocker's own longest chain — used to list the actual tasks behind a blocking branch, not just its total. */
export interface ChainTaskSummary {
  id: string;
  taskCode: string | null;
  taskName: string;
  points: number;
  completedAt: string | null;
  /** True when this same task also appears in another blocker's chain on this node — its points are only counted once in the node's deduplicated blockersTotalChainPoints, so this flags it for the UI to highlight (and, if useful, list that blocker first). */
  sharedWithOtherBlockers: boolean;
}

/** One task blocking a critical-path task — not just its critical-chain predecessor, every real blocker. */
export interface CriticalPathBlocker {
  id: string;
  taskCode: string | null;
  taskName: string;
  /** This blocker's own points. */
  points: number;
  /**
   * This blocker's own longest upstream chain total — its points plus
   * everything transitively blocking IT (e.g. if this blocker is itself
   * blocked by another task, that task's points are folded in here too).
   * This, not `points`, is what actually explains why a given branch did or
   * didn't win the critical path — a blocker with few points of its own can
   * still represent a long chain once its own blockers are counted.
   */
  chainPoints: number;
  /** Sum of chain[].points where completedAt is set — how much of this blocker's own chain is actually done. */
  chainCompletedPoints: number;
  /** The actual tasks making up this blocker's longest chain, oldest first, ending at the blocker itself. */
  chain: ChainTaskSummary[];
}

export interface CriticalPathTaskNode {
  id: string;
  taskCode: string | null;
  taskName: string;
  epicKey: string | null;
  epicName: string | null;
  points: number;
  completedAt: string | null;
  /** Every task that blocks this one, resolved from blockedByTaskIds — a task can be blocked by more than one, but only the longest chain among them determines the critical path itself. */
  blockers: CriticalPathBlocker[];
  /**
   * How much real work sits behind every blocking branch, not just the one
   * that won — the UNION of every task appearing in any blocker's own chain,
   * each counted once. Two blockers can share an upstream task (e.g. both
   * ultimately blocked by the same earlier task); summing each blocker's
   * chainPoints independently would double-count that shared task, so this
   * deduplicates by task id first. See ChainTaskSummary.sharedWithOtherBlockers.
   */
  blockersTotalChainPoints: number;
  /** The completed half of blockersTotalChainPoints's same deduplicated union. */
  blockersCompletedChainPoints: number;
  /** blockersCompletedChainPoints / blockersTotalChainPoints * 100 — how much of the work blocking this task is actually done. 100 when this task has no blockers (nothing left to finish first). */
  blockersChainPercentDone: number;
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
      // Every node was walked in the loop above, so its longest-chain-ending-here (total + path) is already
      // memoized — reuse it rather than recomputing, and rather than reporting just the blocker's own points.
      const rawChains = t.blockedByTaskIds
        .map((blockerId) => byId.get(blockerId))
        .filter((b): b is TaskRecord => b !== undefined)
        .map((b) => ({ blocker: b, path: (memo.get(b.id) ?? { total: b.points, path: [b.id] }).path }));

      // A task's own chain (per blocker) is reported in full regardless — but two blockers can share an
      // upstream task, so tally how many chains each task-id appears in before building the union total.
      const chainIdCounts = new Map<string, number>();
      for (const { path } of rawChains) {
        for (const chainId of path) {
          chainIdCounts.set(chainId, (chainIdCounts.get(chainId) ?? 0) + 1);
        }
      }

      const blockers: CriticalPathBlocker[] = rawChains.map(({ blocker: b, path }) => {
        const chain: ChainTaskSummary[] = path.map((chainId) => {
          const chainTask = byId.get(chainId) as TaskRecord;
          return {
            id: chainTask.id,
            taskCode: chainTask.taskCode,
            taskName: chainTask.taskName,
            points: chainTask.points,
            completedAt: chainTask.completedAt,
            sharedWithOtherBlockers: (chainIdCounts.get(chainId) ?? 0) > 1,
          };
        });
        const chainPoints = chain.reduce((sum, c) => sum + c.points, 0);
        return {
          id: b.id,
          taskCode: b.taskCode,
          taskName: b.taskName,
          points: b.points,
          chainPoints,
          chainCompletedPoints: chain.filter((c) => c.completedAt !== null).reduce((sum, c) => sum + c.points, 0),
          chain,
        };
      });

      // Deduplicated union across every blocker's chain — each shared task's points counted exactly once.
      const unionTasks = new Map<string, ChainTaskSummary>();
      for (const b of blockers) {
        for (const c of b.chain) {
          unionTasks.set(c.id, c);
        }
      }
      const blockersTotalChainPoints = Array.from(unionTasks.values()).reduce((sum, c) => sum + c.points, 0);
      const blockersCompletedChainPoints = Array.from(unionTasks.values())
        .filter((c) => c.completedAt !== null)
        .reduce((sum, c) => sum + c.points, 0);
      return {
        id: t.id,
        taskCode: t.taskCode,
        taskName: t.taskName,
        epicKey: t.epicKey,
        epicName: t.epicKey ? epicNameByKey.get(t.epicKey) ?? null : null,
        points: t.points,
        completedAt: t.completedAt,
        blockers,
        blockersTotalChainPoints,
        blockersCompletedChainPoints,
        blockersChainPercentDone:
          blockersTotalChainPoints > 0 ? Math.round((blockersCompletedChainPoints / blockersTotalChainPoints) * 100) : 100,
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
