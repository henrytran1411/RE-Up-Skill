/**
 * Lifecycle of one employee skill-history entry:
 * START (declared by employee) -> LEARNING (employee is actively logging
 * progress) -> VERIFIED (PM/Tech Lead reviewed evidence) -> CONFIRMED
 * (final sign-off; counts toward the skill score in evaluations).
 */
export enum SkillStatus {
  START = 'start',
  LEARNING = 'learning',
  VERIFIED = 'verified',
  CONFIRMED = 'confirmed',
}
