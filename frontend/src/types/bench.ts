import { BenchActivityType } from './common';

export interface BenchLog {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string | null;
  activityType: BenchActivityType;
  description: string;
  outcomeScore: number | null;
  isReviewed: boolean;
  reviewedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IdleBenchAlert {
  employeeId: string;
  lastActivityDate: string;
  daysIdle: number;
}

export interface IdleLearningAlert {
  employeeId: string;
  lastActivityDate: string;
  daysIdle: number;
  thresholdDays: number;
}
