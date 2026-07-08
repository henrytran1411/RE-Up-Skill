export interface PerformanceScorePeriod {
  employeeId: string;
  year: number;
  half: 'H1' | 'H2';
  periodStart: string;
  periodEnd: string;
  /** Technical Point as of when this period was snapshotted (or right now, for the live current period). */
  technicalPoint: number;
  /** Sum of contribution points recorded in this half. */
  contributionPoints: number;
  /** Sum of verified certificate points from this half. */
  certificatePoints: number;
  /** technicalPoint + contributionPoints + certificatePoints. */
  totalScore: number;
  /** True once this period has been snapshotted (frozen history); false for the live, still-changing current period. */
  isFinal: boolean;
}
