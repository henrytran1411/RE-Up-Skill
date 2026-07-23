import { ProjectStatus } from './common';

export interface ProjectSummary {
  projectName: string;
  managerId: string | null;
  managerName: string | null;
  status: ProjectStatus;
  taskCount: number;
  completedTaskCount: number;
  contributorCount: number;
  totalPoints: number;
  /** Sum of `points` across only completed tasks — points actually delivered so far, vs. totalPoints' full planned scope. */
  totalActualPoints: number;
  totalEstimateHours: number;
  totalActualHours: number;
  startDate: string | null;
  targetEndDate: string | null;
}

export interface PublicProjectContributor {
  employeeId: string;
  employeeName: string;
  taskCount: number;
  points: number;
  estimateHours: number;
  actualHours: number;
  pointsEffortPercent: number;
  estimateEffortPercent: number;
  actualEffortPercent: number;
}

export interface ProjectContributor extends PublicProjectContributor {
  /** ROI inputs/outputs — null when the employee has no salary on file. */
  monthlySalary: number | null;
  hoursSpent: number;
  cost: number | null;
  revenueShare: number;
  netContribution: number | null;
  roiPercent: number | null;
}

/** What a PM sees for a project they manage — no revenue/cost/ROI figures. */
export interface PublicProjectOverview extends ProjectSummary {
  contributors: PublicProjectContributor[];
}

export interface ProjectOverview extends ProjectSummary {
  revenue: number;
  totalCost: number;
  netProfit: number;
  roiPercent: number | null;
  contributorsMissingSalaryCount: number;
  contributors: ProjectContributor[];
}

export function hasRoiData(overview: ProjectOverview | PublicProjectOverview): overview is ProjectOverview {
  return 'revenue' in overview;
}
