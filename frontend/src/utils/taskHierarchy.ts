import { TaskWithEmployee } from '../types/evaluation';

export interface TaskTreeRow extends TaskWithEmployee {
  children?: TaskTreeRow[];
  /** Sum of every descendant Task's points — the Points column shows this for Epic/Story rows instead of their own (always-0) points value. */
  rollupPoints?: number;
}

/**
 * Groups tasks into an Epic -> User Story -> Task tree for an expandable
 * table: Epics show on first load, expanding one reveals its Stories,
 * expanding a Story reveals its Tasks. Only Task issues carry real points
 * per this team's Jira convention — Epic/Story rows show the sum of their
 * descendants' points instead. Bug/Sub-task issues nest as leaves the same
 * way Tasks do. A leaf linked straight to an Epic (no Story) nests directly
 * under it; anything that can't be matched to a parent (ad-hoc tasks, or a
 * dangling epicKey/storyKey) surfaces as a flat top-level row instead of
 * being dropped.
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
      rollupPoints: children.reduce((sum, c) => sum + c.points, 0),
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
      rollupPoints: children.reduce((sum, c) => sum + (c.rollupPoints ?? c.points), 0),
    };
  });

  const orphanStoryRows = stories.filter((s) => !usedStoryIds.has(s.id)).map(toStoryRow);
  const orphanLeafRows = leaves.filter((l) => !usedLeafIds.has(l.id)).map(toLeafRow);

  return [...epicRows, ...orphanStoryRows, ...orphanLeafRows];
}
