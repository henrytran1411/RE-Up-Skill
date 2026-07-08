export interface SkillLevel {
  id: string;
  name: string;
  /** Weight point applied when scoring an employee's skill held at this level, e.g. 6 for Senior. */
  weight: number;
  createdAt: string;
  updatedAt: string;
}
