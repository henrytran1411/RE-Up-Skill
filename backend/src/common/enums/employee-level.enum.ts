/**
 * An employee's overall career level is capped at Senior — Expert/Master
 * exist only on the SkillLevel catalog for per-skill scoring, not for
 * career level. Kept as an explicit whitelist (not the full SkillLevel
 * catalog) so adding an Expert/Master *skill* level doesn't silently become
 * a valid career level too.
 */
export const EMPLOYEE_LEVEL_NAMES = ['Junior', 'Middle', 'Senior'] as const;

export type EmployeeLevelName = (typeof EMPLOYEE_LEVEL_NAMES)[number];
