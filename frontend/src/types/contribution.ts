import { ContributionSource } from './common';

export interface ContributionRecord {
  id: string;
  employeeId: string;
  employee?: { id: string; fullName: string };
  source: ContributionSource;
  points: number;
  recordDate: string;
  description: string;
  recordedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContributionYearSummary {
  employeeId: string;
  year: number;
  totalPoints: number;
  bySource: Record<ContributionSource, number>;
  records: ContributionRecord[];
}
