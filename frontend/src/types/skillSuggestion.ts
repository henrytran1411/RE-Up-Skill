import { CompanyNeedLevel } from './common';

export interface SuggestedSkill {
  id: string;
  name: string;
  isFoundational: boolean;
  isKeySkill: boolean;
  companyNeedLevel: CompanyNeedLevel;
}

export interface SkillGapSuggestion {
  categoryId: string;
  categoryName: string;
  /** 1 (low) to 4 (highest) — see SkillCategory.priority. Suggestions are sorted by this, descending. */
  priority: number;
  description: string | null;
  suggestedSkills: SuggestedSkill[];
}
