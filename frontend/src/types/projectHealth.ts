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

/** One task in a blocker's own longest chain — the actual tasks behind a blocking branch, not just its total. */
export interface ChainTaskSummary {
  id: string;
  taskCode: string | null;
  taskName: string;
  points: number;
  completedAt: string | null;
  /** True when this same task also appears in another blocker's chain on this node — its points are only counted once in blockersTotalChainPoints, so this flags it for highlighting. */
  sharedWithOtherBlockers: boolean;
}

/** One task blocking a critical-path task — not just its critical-chain predecessor, every real blocker. */
export interface CriticalPathBlocker {
  id: string;
  taskCode: string | null;
  taskName: string;
  /** This blocker's own points. */
  points: number;
  /** This blocker's own longest upstream chain total — its points plus everything transitively blocking IT. This, not `points`, explains why a branch did or didn't win the critical path. */
  chainPoints: number;
  /** Sum of chain[].points where completedAt is set. */
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
  /** Every task that blocks this one — a task can be blocked by more than one, though only the longest chain among them determines the critical path itself. */
  blockers: CriticalPathBlocker[];
  /** How much real work sits behind every blocking branch — the UNION of every task in any blocker's chain, each counted once (a shared upstream task between two blockers isn't double-counted). */
  blockersTotalChainPoints: number;
  /** The completed half of blockersTotalChainPoints's same deduplicated union. */
  blockersCompletedChainPoints: number;
  /** blockersCompletedChainPoints / blockersTotalChainPoints * 100 — how much of the work blocking this task is done. 100 when there are no blockers. */
  blockersChainPercentDone: number;
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
