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

/**
 * Completion percent for any row, parent or leaf. A parent (has children):
 * rollupCompletedPoints / rollupPoints, 0 when there's nothing to divide by.
 * A leaf has no points-based partial progress — it's either done or not —
 * so it's 100 once completedAt is set, else 0.
 */
export function progressPercent(row: TaskTreeRow): number {
  if (!row.children) {
    return row.completedAt !== null ? 100 : 0;
  }
  const total = row.rollupPoints ?? 0;
  const completed = row.rollupCompletedPoints ?? 0;
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export interface AllTasksProgress {
  /** donePoints / totalPoints as a whole number percent, 0 when totalPoints is 0. */
  percent: number;
  donePoints: number;
  totalPoints: number;
}

/**
 * What fraction of this project's real work is done, weighted by points
 * (not task count) — points from completed leaf tasks / points from every
 * leaf task. The project-wide counterpart to progressPercent's per-Epic/Story
 * view, using the same points-based definition of "done" (leafCompletedPoints)
 * rather than a flat headcount, so a handful of large completed tasks isn't
 * dwarfed by many small incomplete ones or vice versa. Epic/Story are
 * excluded — they're grouping rows with no points of their own, not
 * individually-completable work. Returns the raw donePoints/totalPoints
 * alongside the percent so callers can show both (e.g. "40% 80/200").
 */
export function allTasksProgress(tasks: TaskWithEmployee[]): AllTasksProgress {
  const leafTasks = tasks.filter((t) => t.issueType !== 'Epic' && t.issueType !== 'Story');
  const totalPoints = leafTasks.reduce((sum, t) => sum + t.points, 0);
  const donePoints = leafTasks.reduce((sum, t) => sum + leafCompletedPoints(t), 0);
  const percent = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
  return { percent, donePoints, totalPoints };
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
