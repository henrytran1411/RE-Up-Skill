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
  estimatedSprintsNeeded: number;
  blockedByEpicKeys: string[];
  isOnCriticalPath: boolean;
}

export type ProjectHealthStatus = 'good' | 'normal' | 'bad';

export interface ProjectHealthReport {
  sprints: SprintBurn[];
  epics: EpicHealth[];
  criticalPath: string[];
  velocityPointsPerSprint: number;
  sprintsElapsed: number;
  criticalPathAdditionalSprints: number;
  projectedFinishSprint: number;
  projectedFinishDate: string | null;
  targetEndDate: string | null;
  daysLate: number | null;
  status: ProjectHealthStatus;
}

/** One task blocking a critical-path task — not just its critical-chain predecessor, every real blocker. */
export interface CriticalPathBlocker {
  id: string;
  taskCode: string | null;
  taskName: string;
  points: number;
}

export interface CriticalPathTaskNode {
  id: string;
  taskCode: string | null;
  taskName: string;
  epicKey: string | null;
  epicName: string | null;
  points: number;
  completedAt: string | null;
  /** Every task that blocks this one — a task can be blocked by more than one, though only the longest chain among them determines the critical path itself. */
  blockers: CriticalPathBlocker[];
  /** Sum of blockers[].points. */
  blockersTotalPoints: number;
}

export interface NonCriticalEpicGroup {
  epicKey: string | null;
  epicName: string;
  taskCount: number;
  totalEstimateHours: number;
}

/** The task-level critical path across every leaf task in a project — distinct from ProjectHealthReport's Epic-level one. */
export interface TaskCriticalPathReport {
  criticalPath: CriticalPathTaskNode[];
  criticalPathTotalPoints: number;
  criticalPathCompletedPoints: number;
  criticalPathPercentDone: number;
  allTasksTotalPoints: number;
  allTasksCompletedPoints: number;
  allTasksPercentDone: number;
  nonCriticalByEpic: NonCriticalEpicGroup[];
}
