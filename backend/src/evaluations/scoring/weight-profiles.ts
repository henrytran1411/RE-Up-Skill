export interface WeightProfile {
  taskWeight: number;
  skillWeight: number;
  softSkillWeight: number;
  benchWeight: number;
}

/**
 * Base weight profile from CLAUDE.md section 4.2. All levels share the same
 * top-level split by default; per-level emphasis (4.1) is expressed inside
 * each sub-score's calculation (see scoring.util.ts), not by shifting these
 * top-level weights. Override here if a level needs a different split.
 */
const BASE_PROFILE: WeightProfile = {
  taskWeight: 0.4,
  skillWeight: 0.3,
  softSkillWeight: 0.15,
  benchWeight: 0.15,
};

/**
 * Keyed by level name (matching a SkillLevel catalog entry, e.g. "Senior")
 * rather than a fixed enum, since levels are now admin-managed. Any level not
 * listed here — including ones added to the catalog later — falls back to
 * BASE_PROFILE (see blendWeightProfiles).
 */
export const WEIGHT_PROFILES: Record<string, WeightProfile> = {};

/**
 * Pro-rates a weight profile across levels held during the evaluation period,
 * e.g. an employee promoted Junior -> Middle mid-cycle gets a blended profile
 * weighted by the fraction of the period spent at each level.
 */
export function blendWeightProfiles(
  levelBreakdown: { level: string; fraction: number }[],
): WeightProfile {
  return levelBreakdown.reduce<WeightProfile>(
    (acc, { level, fraction }) => {
      const profile = WEIGHT_PROFILES[level] ?? BASE_PROFILE;
      return {
        taskWeight: acc.taskWeight + profile.taskWeight * fraction,
        skillWeight: acc.skillWeight + profile.skillWeight * fraction,
        softSkillWeight: acc.softSkillWeight + profile.softSkillWeight * fraction,
        benchWeight: acc.benchWeight + profile.benchWeight * fraction,
      };
    },
    { taskWeight: 0, skillWeight: 0, softSkillWeight: 0, benchWeight: 0 },
  );
}
