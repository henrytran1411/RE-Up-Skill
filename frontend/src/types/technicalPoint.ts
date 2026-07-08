export interface TechnicalPointSkillLine {
  employeeSkillId: string;
  skillName: string;
  category: string | null;
  level: string;
  levelWeight: number;
  keyMultiplier: number;
  isPrimary: boolean;
  isFoundational: boolean;
  categoryPrimaryWeight: number;
  categorySecondaryWeight: number;
  /** Contribution to A (primary-category points) — 0 unless isPrimary. */
  contributionToA: number;
  /** Contribution to B (non-primary-category points) — 0 unless !isPrimary. */
  contributionToB: number;
  /** Contribution to C (foundational points) — 0 unless isFoundational. */
  contributionToC: number;
}

export interface TechnicalPointBreakdown {
  employeeId: string;
  /** A: total points from all primary skills across every category. */
  primaryPoints: number;
  /** B: total points from all non-primary skills across every category. */
  nonPrimaryPoints: number;
  /** C: total points from every foundational skill. */
  foundationalPoints: number;
  /** T = A + B + C. */
  totalPoints: number;
  skills: TechnicalPointSkillLine[];
}
