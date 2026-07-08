export interface EmployeeTaskScore {
  employeeId: string;
  /** Calendar year this score was computed over. */
  year: number;
  /** 0-100, see backend TasksService#findTaskScoreForEmployee — blends PM rating, on-time delivery, and complexity across tasks completed in `year`. */
  taskScore: number;
  completedTaskCount: number;
  /** Sum of `points` across every project, for tasks completed in `year`. */
  totalPoints: number;
  /** Sum of `estimateHours` across every project, for tasks completed in `year`. */
  estimatedHours: number;
  /** estimatedHours / (22*8*12 - 20*8) * 100 — how much of a full year's capacity this represents. Can exceed 100. */
  workloadPercent: number;
  /** Sum of `actualHours` across every project, for tasks completed in `year`. */
  actualHours: number;
  /** actualHours / (22*8*12 - 20*8) * 100 — how much of a full year's capacity was actually spent. Can exceed 100. */
  actualWorkloadPercent: number;
}
