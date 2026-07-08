import { EmployeeSkill } from '../types/skill';
import { SkillTrack } from '../types/common';
import { GanttChart, GanttRow } from './GanttChart';

type LeveledSkill = EmployeeSkill & { level: string };

/**
 * One employee's skill portfolio: one row per skill, segments show the
 * Junior -> Middle -> Senior journey for that specific skill.
 */
export function SkillPortfolioChart({ entries }: { entries: EmployeeSkill[] }) {
  const leveled = entries.filter(
    (e): e is LeveledSkill => e.track === SkillTrack.CURRENT && e.level !== null,
  );
  if (leveled.length === 0) {
    return <div style={{ color: '#999' }}>No leveled skills to chart yet.</div>;
  }

  const bySkill = new Map<string, LeveledSkill[]>();
  leveled.forEach((entry) => {
    const list = bySkill.get(entry.skill.name) ?? [];
    list.push(entry);
    bySkill.set(entry.skill.name, list);
  });

  const rows: GanttRow[] = Array.from(bySkill.entries()).map(([skillName, list]) => ({
    name: skillName,
    segments: list.map((entry) => ({
      level: entry.level,
      startDate: entry.startDate,
      endDate: entry.endDate,
      durationDays: entry.durationDays,
    })),
  }));

  return <GanttChart rows={rows} />;
}
