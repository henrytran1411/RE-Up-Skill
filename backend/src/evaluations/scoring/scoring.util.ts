import { TaskRecord } from '../../tasks/entities/task-record.entity';
import { EmployeeSkill, SkillTrack } from '../../skills/entities/employee-skill.entity';
import { BenchLog } from '../../bench-time/entities/bench-log.entity';
import { BenchActivityType } from '../../common/enums/bench-activity-type.enum';
import { SkillStatus } from '../../common/enums/skill-status.enum';

const clamp0to100 = (value: number) => Math.max(0, Math.min(100, value));

/**
 * Task score (0-100): blends PM rating, on-time delivery vs. estimate, and
 * task complexity so a dev clearing hard tasks on time scores higher than one
 * clearing easy tasks late.
 */
export function computeTaskScore(tasks: TaskRecord[]): number {
  const completed = tasks.filter((t) => t.completedAt && t.actualHours != null);
  if (completed.length === 0) {
    return 0;
  }

  const perTaskScores = completed.map((task) => {
    const ratingComponent = ((task.pmRating ?? 3) / 5) * 100;
    const onTimeRatio = task.actualHours! > 0 ? Number(task.estimateHours) / task.actualHours! : 1;
    const onTimeComponent = clamp0to100(onTimeRatio * 100);
    const bugPenalty = Math.min(task.bugCount * 5, 30);
    const complexityBonus = (task.complexity - 1) * 2.5; // up to +10 for complexity 5

    const raw = ratingComponent * 0.5 + onTimeComponent * 0.5 + complexityBonus - bugPenalty;
    return clamp0to100(raw);
  });

  return perTaskScores.reduce((sum, s) => sum + s, 0) / perTaskScores.length;
}

/**
 * Skill score (0-100): average proficiency growth for confirmed CURRENT
 * skills plus progress on confirmed LEARNING skills. Entries still in
 * start/learning/verified status do not count until a PM/Tech Lead gives
 * final confirmation.
 */
export function computeSkillScore(employeeSkills: EmployeeSkill[]): number {
  const confirmed = employeeSkills.filter((s) => s.status === SkillStatus.CONFIRMED);
  if (confirmed.length === 0) {
    return 0;
  }

  const currentSkills = confirmed.filter((s) => s.track === SkillTrack.CURRENT);
  const learningSkills = confirmed.filter((s) => s.track === SkillTrack.LEARNING);

  const currentComponent =
    currentSkills.length > 0
      ? (currentSkills.reduce((sum, s) => sum + s.proficiency, 0) / currentSkills.length / 5) * 100
      : null;

  const learningComponent =
    learningSkills.length > 0
      ? learningSkills.reduce((sum, s) => sum + (s.progressPercent ?? 0), 0) / learningSkills.length
      : null;

  const components = [currentComponent, learningComponent].filter(
    (c): c is number => c !== null,
  );
  if (components.length === 0) {
    return 0;
  }

  return clamp0to100(components.reduce((sum, c) => sum + c, 0) / components.length);
}

/**
 * Soft-skill score (0-100): base score with a multiplier applied for
 * confirmed key skills (e.g. English) per CLAUDE.md section 4.2.
 */
export function computeSoftSkillScore(
  employeeSkills: EmployeeSkill[],
  baseSoftSkillScore = 70,
): number {
  const keySkillMultipliers = employeeSkills
    .filter((s) => s.status === SkillStatus.CONFIRMED && s.skill?.isKeySkill)
    .map((s) => Number(s.skill.keySkillMultiplier));

  if (keySkillMultipliers.length === 0) {
    return clamp0to100(baseSoftSkillScore);
  }

  const bestMultiplier = Math.max(...keySkillMultipliers);
  return clamp0to100(baseSoftSkillScore * bestMultiplier);
}

/**
 * Bench score (0-100): rewards active output (e.g. internal tools) over
 * passive activity (e.g. reading docs) per CLAUDE.md section 4.2. An
 * employee with no bench time in the period is scored neutral (100) since
 * there was nothing to optimize.
 */
export function computeBenchScore(benchLogs: BenchLog[]): number {
  const reviewed = benchLogs.filter((b) => b.isReviewed && b.outcomeScore != null);
  if (reviewed.length === 0) {
    return 100;
  }

  const ACTIVITY_WEIGHT: Record<BenchActivityType, number> = {
    [BenchActivityType.INTERNAL_TOOL]: 1.2,
    [BenchActivityType.SUPPORT_OTHER_PROJECT]: 1.1,
    [BenchActivityType.CERTIFICATION]: 1.05,
    [BenchActivityType.LEARNING]: 1.0,
    [BenchActivityType.OTHER]: 0.9,
  };

  const scores = reviewed.map((log) => {
    const base = (log.outcomeScore! / 5) * 100;
    return clamp0to100(base * ACTIVITY_WEIGHT[log.activityType]);
  });

  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}
