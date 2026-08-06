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
 * Groups tasks into an Epic -> User Story -> Task -> Sub-task tree for an
 * expandable table: Epics show on first load, expanding one reveals its
 * Stories, expanding a Story reveals its Tasks/Bugs, and expanding a Task
 * reveals its own Sub-tasks (matched by TaskRecord.parentTaskKey — see
 * JiraService.resolveParentTaskKey). Bug nests as a flat leaf the same way
 * it always has, since it has no reliable real parent link the way Sub-task
 * does. A leaf linked straight to an Epic (no Story) nests directly under
 * it; anything that can't be matched to a parent (ad-hoc tasks, a dangling
 * epicKey/storyKey, or a Sub-task whose parent Task isn't in this project)
 * surfaces as a flat top-level row instead of being dropped.
 *
 * Per this team's convention, Epic/Story/Bug store 0 (or null for
 * actualHours) for points/estimate hours and show the sum of their
 * descendants' points/estimateHours/actualHours instead — and so does a
 * Task once it has Sub-tasks of its own (TasksService.recalculateTaskRollupsForProject
 * zeroes the Task's own fields after every Jira sync specifically so this
 * rollup is the only place the total shows up — storing the sum on the Task
 * too would double-count it in every raw points/hours total elsewhere).
 */
export function buildTaskHierarchy(tasks: TaskWithEmployee[]): TaskTreeRow[] {
  const epics = tasks.filter((t) => t.issueType === 'Epic');
  const stories = tasks.filter((t) => t.issueType === 'Story');
  const leaves = tasks.filter((t) => t.issueType !== 'Epic' && t.issueType !== 'Story');

  const subtasksByParentTaskKey = new Map<string, TaskWithEmployee[]>();
  for (const l of leaves) {
    if (l.issueType !== 'Sub-task' || !l.parentTaskKey) {
      continue;
    }
    const list = subtasksByParentTaskKey.get(l.parentTaskKey) ?? [];
    list.push(l);
    subtasksByParentTaskKey.set(l.parentTaskKey, list);
  }

  // A Sub-task inherits its parent Task's own epicKey/storyKey (see JiraService.resolveEpicAndStoryKey), so
  // without this exclusion it would match a Story's/Epic's childLeaves filter too and render twice — once
  // nested under its parent Task below, and once again as that Task's flat sibling.
  const taskKeysPresent = new Set(
    leaves.filter((l) => l.issueType === 'Task' && l.jiraIssueKey !== null).map((l) => l.jiraIssueKey as string),
  );
  const isNestedUnderTask = (l: TaskWithEmployee): boolean =>
    l.issueType === 'Sub-task' && l.parentTaskKey !== null && taskKeysPresent.has(l.parentTaskKey);

  const usedStoryIds = new Set<string>();
  const usedLeafIds = new Set<string>();
  const usedSubtaskIds = new Set<string>();

  const toLeafRow = (t: TaskWithEmployee): TaskTreeRow => {
    const childSubtasks = t.issueType === 'Task' && t.jiraIssueKey ? subtasksByParentTaskKey.get(t.jiraIssueKey) : undefined;
    if (!childSubtasks || childSubtasks.length === 0) {
      return { ...t };
    }
    childSubtasks.forEach((s) => usedSubtaskIds.add(s.id));
    const children = childSubtasks.map((s) => ({ ...s }));
    return {
      ...t,
      children,
      rollupPoints: sumRollup(children, 'points'),
      rollupEstimateHours: sumRollup(children, 'estimateHours'),
      rollupActualHours: sumRollup(children, 'actualHours'),
      rollupCompletedPoints: sumCompletedPointsRollup(children),
    };
  };

  const toStoryRow = (story: TaskWithEmployee): TaskTreeRow => {
    const childLeaves = leaves.filter(
      (l) => story.jiraIssueKey !== null && l.storyKey === story.jiraIssueKey && !isNestedUnderTask(l),
    );
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
      (l) => epic.jiraIssueKey !== null && l.epicKey === epic.jiraIssueKey && !l.storyKey && !isNestedUnderTask(l),
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
  const orphanLeafRows = leaves
    .filter((l) => !usedLeafIds.has(l.id) && !usedSubtaskIds.has(l.id) && !isNestedUnderTask(l))
    .map(toLeafRow);

  return [...epicRows, ...orphanStoryRows, ...orphanLeafRows];
}
