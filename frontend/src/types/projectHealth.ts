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
