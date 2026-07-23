import { TaskWithEmployee } from '../types/evaluation';

export interface TaskTreeRow extends TaskWithEmployee {
  children?: TaskTreeRow[];
  /** Sum of every descendant's points/estimateHours/actualHours — the Points/Estimate hrs/Actual hrs columns show these for Epic/Story rows instead of their own (always-0, or not meaningful) stored values. */
  rollupPoints?: number;
  rollupEstimateHours?: number;
  rollupActualHours?: number;
  /** Sum of every descendant's points where completedAt is set — the numerator behind the Epic/Story progress bar. */
  rollupCompletedPoints?: number;
}

const ROLLUP_FIELD = {
  points: 'rollupPoints',
  estimateHours: 'rollupEstimateHours',
  actualHours: 'rollupActualHours',
} as const;

function sumRollup(children: TaskTreeRow[], field: keyof typeof ROLLUP_FIELD): number {
  const rollupField = ROLLUP_FIELD[field];
  return children.reduce((sum, c) => sum + (c[rollupField] ?? c[field] ?? 0), 0);
}

/** A leaf's own completed points — its full points if done, else 0 (never partial). */
function leafCompletedPoints(t: TaskWithEmployee): number {
  return t.completedAt !== null ? t.points : 0;
}

function sumCompletedPointsRollup(children: TaskTreeRow[]): number {
  return children.reduce((sum, c) => sum + (c.rollupCompletedPoints ?? leafCompletedPoints(c)), 0);
}

/** Epic/Story completion percent: rollupCompletedPoints / rollupPoints, 0 when there's nothing to divide by. */
export function progressPercent(row: TaskTreeRow): number {
  const total = row.rollupPoints ?? 0;
  const completed = row.rollupCompletedPoints ?? 0;
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/**
 * Groups tasks into an Epic -> User Story -> Task tree for an expandable
 * table: Epics show on first load, expanding one reveals its Stories,
 * expanding a Story reveals its Tasks. Bug/Sub-task issues nest as leaves
 * the same way Tasks do. A leaf linked straight to an Epic (no Story) nests
 * directly under it; anything that can't be matched to a parent (ad-hoc
 * tasks, or a dangling epicKey/storyKey) surfaces as a flat top-level row
 * instead of being dropped.
 *
 * Per this team's convention, only Task issues carry real points/estimate
 * hours — Epic/Story/Bug/Sub-task all store 0 for those two fields. Epic
 * and Story rows show the sum of their descendants' points/estimateHours/
 * actualHours instead of their own (0) stored value; Bug/Sub-task keep
 * their own real actualHours, which still rolls up into their parent
 * Story/Epic alongside Task's.
 */
export function buildTaskHierarchy(tasks: TaskWithEmployee[]): TaskTreeRow[] {
  const epics = tasks.filter((t) => t.issueType === 'Epic');
  const stories = tasks.filter((t) => t.issueType === 'Story');
  const leaves = tasks.filter((t) => t.issueType !== 'Epic' && t.issueType !== 'Story');

  const usedStoryIds = new Set<string>();
  const usedLeafIds = new Set<string>();

  const toLeafRow = (t: TaskWithEmployee): TaskTreeRow => ({ ...t });

  const toStoryRow = (story: TaskWithEmployee): TaskTreeRow => {
    const childLeaves = leaves.filter((l) => story.jiraIssueKey !== null && l.storyKey === story.jiraIssueKey);
    childLeaves.forEach((l) => usedLeafIds.add(l.id));
    const children = childLeaves.map(toLeafRow);
    return {
      ...story,
      children: children.length > 0 ? children : undefined,
      rollupPoints: sumRollup(children, 'points'),
      rollupEstimateHours: sumRollup(children, 'estimateHours'),
      rollupActualHours: sumRollup(children, 'actualHours'),
      rollupCompletedPoints: sumCompletedPointsRollup(children),
    };
  };

  const epicRows = epics.map((epic) => {
    const childStories = stories.filter((s) => epic.jiraIssueKey !== null && s.epicKey === epic.jiraIssueKey);
    childStories.forEach((s) => usedStoryIds.add(s.id));
    const directLeaves = leaves.filter(
      (l) => epic.jiraIssueKey !== null && l.epicKey === epic.jiraIssueKey && !l.storyKey,
    );
    directLeaves.forEach((l) => usedLeafIds.add(l.id));

    const storyRows = childStories.map(toStoryRow);
    const leafRows = directLeaves.map(toLeafRow);
    const children = [...storyRows, ...leafRows];
    return {
      ...epic,
      children: children.length > 0 ? children : undefined,
      rollupPoints: sumRollup(children, 'points'),
      rollupEstimateHours: sumRollup(children, 'estimateHours'),
      rollupActualHours: sumRollup(children, 'actualHours'),
      rollupCompletedPoints: sumCompletedPointsRollup(children),
    };
  });

  const orphanStoryRows = stories.filter((s) => !usedStoryIds.has(s.id)).map(toStoryRow);
  const orphanLeafRows = leaves.filter((l) => !usedLeafIds.has(l.id)).map(toLeafRow);

  return [...epicRows, ...orphanStoryRows, ...orphanLeafRows];
}
