/** How a level-history entry came to be, for audit/traceability. */
export enum LevelHistorySource {
  /** Set when the employee record was first created. */
  INITIAL = 'initial',
  /** Auto-promoted because a CURRENT-track skill was confirmed at a higher level. */
  AUTO_PROMOTION = 'auto_promotion',
  /** Deliberately set by HR/Admin via the employee edit form. */
  MANUAL = 'manual',
}
