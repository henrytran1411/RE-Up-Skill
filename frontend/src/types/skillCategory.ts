export interface SkillCategory {
  id: string;
  name: string;
  description: string | null;
  /** Score weight for an employee's primary skill in this category, e.g. 1.0. */
  primaryWeight: number;
  /** Score weight for every other (non-primary) skill in this category, e.g. 0.2. */
  secondaryWeight: number;
  /** How urgently employees with no skill here should be steered toward learning one — 1 (low) to 4 (highest). */
  priority: number;
  /** Number of catalog skills currently using this category's name. */
  skillCount: number;
  createdAt: string;
  updatedAt: string;
}
