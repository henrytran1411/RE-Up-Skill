import { CompanyNeedLevel, SkillStatus, SkillTrack } from './common';
import { Employee } from './employee';

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  isKeySkill: boolean;
  keySkillMultiplier: number;
  /** How much the company currently needs this skill. */
  companyNeedLevel: CompanyNeedLevel;
  /** A fundamental/prerequisite skill rather than a specialization. */
  isFoundational: boolean;
}

export interface EmployeeSkill {
  id: string;
  employeeId: string;
  employee?: Employee;
  skill: Skill;
  skillId: string;
  track: SkillTrack;
  proficiency: number;
  targetProficiency: number | null;
  progressPercent: number | null;
  /**
   * Career level for this skill (e.g. "Senior" at React) — free text matching
   * a SkillLevel catalog entry's name. Only set for CURRENT track.
   */
  level: string | null;
  /** This employee's flagship skill within its category. At most one CURRENT-track entry per employee per category. */
  isPrimary: boolean;
  status: SkillStatus;
  startDate: string;
  endDate: string | null;
  /** Days spent so far in [startDate, endDate ?? today]. */
  durationDays: number;
  verifiedById: string | null;
  verifiedAt: string | null;
  confirmedById: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
