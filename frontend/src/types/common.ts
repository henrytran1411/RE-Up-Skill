export enum Role {
  DEVELOPER = 'developer',
  TECH_LEAD = 'tech_lead',
  PM = 'pm',
  HR = 'hr',
  ADMIN = 'admin',
}

export enum BenchActivityType {
  LEARNING = 'learning',
  INTERNAL_TOOL = 'internal_tool',
  SUPPORT_OTHER_PROJECT = 'support_other_project',
  CERTIFICATION = 'certification',
  OTHER = 'other',
}

export enum SkillTrack {
  CURRENT = 'current',
  LEARNING = 'learning',
}

export enum SkillStatus {
  START = 'start',
  LEARNING = 'learning',
  VERIFIED = 'verified',
  CONFIRMED = 'confirmed',
}

export enum EvaluationPeriod {
  QUARTERLY = 'quarterly',
  SEMI_ANNUAL = 'semi_annual',
  ANNUAL = 'annual',
}

export enum EvaluationStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in_review',
  COMPLETED = 'completed',
}

export enum EmployeeStatus {
  ON_PROJECT = 'on_project',
  ON_BENCH = 'on_bench',
}

/** Derived from task completion — see computeProjectStatus in the backend's tasks.service.ts. */
export enum ProjectStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

export enum LevelHistorySource {
  INITIAL = 'initial',
  AUTO_PROMOTION = 'auto_promotion',
  MANUAL = 'manual',
}

/** How much the company currently needs this skill — set on the skill catalog. */
export enum CompanyNeedLevel {
  VERY_NEEDED = 'very_needed',
  NORMALLY = 'normally',
  DONT_NEED = 'dont_need',
}

/** Where a ContributionRecord's points came from — set by Admin when logging the entry. */
export enum ContributionSource {
  PM_EVALUATION = 'pm_evaluation',
  SKILL_VERIFICATION = 'skill_verification',
  TASK_COMPLETION = 'task_completion',
  COMPANY_CONTRIBUTION = 'company_contribution',
  COMPANY_REWARD = 'company_reward',
}

export const MANAGER_ROLES = [Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN];
