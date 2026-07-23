import { Injectable } from '@nestjs/common';
import { TaskRecord } from './entities/task-record.entity';

export interface SprintBurn {
  sprintNumber: number;
  estimatedPoints: number;
  burnedPoints: number;
}

export interface EpicHealth {
  key: string;
  name: string;
  totalPoints: number;
  remainingPoints: number;
  /** Sprints still needed to clear this Epic's remaining points at the project's current velocity. */
  estimatedSprintsNeeded: number;
  /** Other Epics (by key) that must finish before this one can. */
  blockedByEpicKeys: string[];
  isOnCriticalPath: boolean;
}

export type ProjectHealthStatus = 'good' | 'normal' | 'bad';

export interface ProjectHealthReport {
  sprints: SprintBurn[];
  epics: EpicHealth[];
  /** Epic keys, in order, forming the longest dependency chain — the sequence that determines the project's earliest possible finish. */
  criticalPath: string[];
  /** Average points burned per elapsed sprint. */
  velocityPointsPerSprint: number;
  sprintsElapsed: number;
  /** Additional sprints the critical path needs beyond what's already elapsed. */
  criticalPathAdditionalSprints: number;
  /** sprintsElapsed + criticalPathAdditionalSprints. */
  projectedFinishSprint: number;
  projectedFinishDate: string | null;
  targetEndDate: string | null;
  /** projectedFinishDate - targetEndDate, in days. Negative/zero means on time or early; null when there's no target to compare against. */
  daysLate: number | null;
  status: ProjectHealthStatus;
}

const SPRINT_LENGTH_DAYS = 14;
/** A sprint's "badness" grace period before a late critical path counts as BAD rather than just NORMAL. */
const NORMAL_STATUS_GRACE_DAYS = SPRINT_LENGTH_DAYS;
/** Floor so a zero-velocity project still yields a large (not infinite/NaN) sprint estimate, instead of dividing by zero. */
const MIN_VELOCITY_FLOOR = 1;

function addDays(isoDate: string, days: number): string {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + Math.round(days));
  return date.toISOString().slice(0, 10);
}

function diffInDaysSigned(fromDate: string, toDate: string): number {
  const ms = new Date(toDate).getTime() - new Date(fromDate).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

@Injectable()
export class ProjectHealthService {
  /**
   * Buckets tasks by their assigned ProjectSprint's own sprintNumber
   * (resolved via `sprintNumberByProjectSprintId`, since TaskRecord only
   * carries the sprint's id), summing estimated (all) vs. burned (completed)
   * points per sprint.
   */
  private computeSprintBurn(tasks: TaskRecord[], sprintNumberByProjectSprintId: Map<string, number>): SprintBurn[] {
    const resolveSprintNumber = (t: TaskRecord): number | undefined =>
      t.projectSprintId ? sprintNumberByProjectSprintId.get(t.projectSprintId) : undefined;

    const sprintNumbers = tasks.map(resolveSprintNumber).filter((n): n is number => n !== undefined);
    const maxSprint = sprintNumbers.length > 0 ? Math.max(...sprintNumbers) : 0;

    const sprints: SprintBurn[] = [];
    for (let sprintNumber = 1; sprintNumber <= maxSprint; sprintNumber++) {
      const sprintTasks = tasks.filter((t) => resolveSprintNumber(t) === sprintNumber);
      sprints.push({
        sprintNumber,
        estimatedPoints: sprintTasks.reduce((sum, t) => sum + t.points, 0),
        burnedPoints: sprintTasks.filter((t) => t.completedAt !== null).reduce((sum, t) => sum + t.points, 0),
      });
    }
    return sprints;
  }

  /**
   * Longest dependency chain reachable ending at `key`, where an Epic's
   * total time is its own `estimatedSprintsNeeded` plus the longest chain
   * among whatever blocks it (it can't finish before its blockers do).
   * `visiting` guards against a cycle in (presumably hand-authored) data.
   */
  private longestChainEndingAt(
    key: string,
    epicByKey: Map<string, EpicHealth>,
    memo: Map<string, { total: number; path: string[] }>,
    visiting: Set<string>,
  ): { total: number; path: string[] } {
    const cached = memo.get(key);
    if (cached) {
      return cached;
    }
    const epic = epicByKey.get(key);
    if (!epic || visiting.has(key)) {
      return { total: 0, path: [] };
    }

    visiting.add(key);
    let best = { total: epic.estimatedSprintsNeeded, path: [key] };
    for (const blockerKey of epic.blockedByEpicKeys) {
      const chain = this.longestChainEndingAt(blockerKey, epicByKey, memo, visiting);
      const candidateTotal = chain.total + epic.estimatedSprintsNeeded;
      if (candidateTotal > best.total) {
        best = { total: candidateTotal, path: [...chain.path, key] };
      }
    }
    visiting.delete(key);
    memo.set(key, best);
    return best;
  }

  /** Builds each Epic's remaining work, dependency edges, and marks whichever chain is longest (the critical path). */
  private computeEpics(tasks: TaskRecord[], velocityPointsPerSprint: number): { epics: EpicHealth[]; criticalPath: string[]; criticalPathAdditionalSprints: number } {
    const epicIssues = tasks.filter((t) => t.issueType === 'Epic' && t.jiraIssueKey);
    const childrenByEpicKey = new Map<string, TaskRecord[]>();
    for (const task of tasks) {
      if (task.issueType === 'Epic' || !task.epicKey) {
        continue;
      }
      const list = childrenByEpicKey.get(task.epicKey) ?? [];
      list.push(task);
      childrenByEpicKey.set(task.epicKey, list);
    }

    const effectiveVelocity = Math.max(velocityPointsPerSprint, MIN_VELOCITY_FLOOR);
    const epicKeys = new Set(epicIssues.map((e) => e.jiraIssueKey as string));

    const epics: EpicHealth[] = epicIssues.map((epicIssue) => {
      const key = epicIssue.jiraIssueKey as string;
      const children = childrenByEpicKey.get(key) ?? [];
      const totalPoints = children.reduce((sum, t) => sum + t.points, 0);
      const remainingPoints = children.filter((t) => t.completedAt === null).reduce((sum, t) => sum + t.points, 0);
      const blockedByEpicKeys = epicIssue.blockedByIssues.map((ref) => ref.key).filter((refKey) => epicKeys.has(refKey));
      return {
        key,
        name: epicIssue.taskName,
        totalPoints,
        remainingPoints,
        estimatedSprintsNeeded: remainingPoints > 0 ? Math.ceil(remainingPoints / effectiveVelocity) : 0,
        blockedByEpicKeys,
        isOnCriticalPath: false,
      };
    });

    const epicByKey = new Map(epics.map((e) => [e.key, e]));
    const memo = new Map<string, { total: number; path: string[] }>();
    let criticalPath: string[] = [];
    let criticalPathAdditionalSprints = 0;
    for (const epic of epics) {
      const chain = this.longestChainEndingAt(epic.key, epicByKey, memo, new Set());
      if (chain.total > criticalPathAdditionalSprints) {
        criticalPathAdditionalSprints = chain.total;
        criticalPath = chain.path;
      }
    }
    for (const key of criticalPath) {
      const epic = epicByKey.get(key);
      if (epic) {
        epic.isOnCriticalPath = true;
      }
    }

    return { epics, criticalPath, criticalPathAdditionalSprints };
  }

  private computeStatus(daysLate: number | null): ProjectHealthStatus {
    if (daysLate === null || daysLate <= 0) {
      return 'good';
    }
    return daysLate <= NORMAL_STATUS_GRACE_DAYS ? 'normal' : 'bad';
  }

  /**
   * `sprintStartDate` anchors sprint 1's start (the project's own earliest
   * task date) so a projected finish date can be computed from sprint
   * counts. `targetEndDate` is the Project's own PM/Admin-declared deadline
   * (see Project.targetEndDate) — null if never set, in which case status
   * is always 'good' (nothing to be late against).
   */
  compute(
    tasks: TaskRecord[],
    sprintNumberByProjectSprintId: Map<string, number>,
    sprintStartDate: string,
    targetEndDate: string | null,
  ): ProjectHealthReport {
    const sprints = this.computeSprintBurn(tasks, sprintNumberByProjectSprintId);
    const sprintsElapsed = sprints.length;
    const totalBurned = sprints.reduce((sum, s) => sum + s.burnedPoints, 0);
    const velocityPointsPerSprint = sprintsElapsed > 0 ? round2(totalBurned / sprintsElapsed) : 0;

    const { epics, criticalPath, criticalPathAdditionalSprints } = this.computeEpics(tasks, velocityPointsPerSprint);

    const projectedFinishSprint = sprintsElapsed + criticalPathAdditionalSprints;
    const projectedFinishDate = addDays(sprintStartDate, projectedFinishSprint * SPRINT_LENGTH_DAYS);
    const daysLate = targetEndDate ? diffInDaysSigned(targetEndDate, projectedFinishDate) : null;

    return {
      sprints,
      epics,
      criticalPath,
      velocityPointsPerSprint,
      sprintsElapsed,
      criticalPathAdditionalSprints,
      projectedFinishSprint,
      projectedFinishDate,
      targetEndDate,
      daysLate,
      status: this.computeStatus(daysLate),
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
