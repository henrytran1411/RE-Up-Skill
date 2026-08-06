import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskRecord } from './entities/task-record.entity';

const ISSUE_CODE_PREFIX: Record<string, string> = {
  Task: 'Task',
  Bug: 'Bug',
  'Sub-task': 'SubTask',
};

@Injectable()
export class TaskCodeService {
  constructor(
    @InjectRepository(TaskRecord)
    private readonly taskRepository: Repository<TaskRecord>,
  ) {}

  /**
   * Recomputes and persists `taskCode` for every Epic/Story/Task/Bug/Sub-task
   * in one project — Epic-{e}, US-{e}.{s}, Task-{e}.{s}.{t},
   * Bug-{e}.{s}.{t}.{n}, SubTask-{e}.{s}.{t}.{n} — deriving the {e}/{s}/{t}
   * numbers from each issue's own Jira creation date (oldest = 1), the same
   * convention used for the hand-seeded example data. A leaf directly under
   * an Epic with no Story uses `0` for {s} (e.g. Task-2.0.1).
   *
   * Bug doesn't have a real "which Task" link in typical Jira data (usually
   * standalone, not literally sub-tasked), so both its {t} and its {n} are
   * approximated: {t} as whichever Task most recently preceded it, by
   * creation date, within the same Story, and {n} as a running count of
   * leaves since that Task. Sub-task is different — Jira's own data model
   * requires its parent to be a real Task (TaskRecord.parentTaskKey,
   * resolved during sync), so a Sub-task's {t} reuses that parent Task's
   * exact number instead of approximating, and its {n} is an exact count of
   * Sub-tasks under that same specific parent (not a general "since the last
   * Task" count), oldest-created first — e.g. two Sub-tasks under Task-1.1.1
   * become SubTask-1.1.1.1 and SubTask-1.1.1.2. Falls back to the same
   * approximation as Bug when parentTaskKey can't be resolved (legacy rows
   * synced before this field existed).
   *
   * Idempotent: recomputes from scratch each time, so re-running after a
   * fresh sync renumbers everything consistently rather than drifting.
   * Issues with no resolvable Epic (ad-hoc tasks, dangling epicKey/storyKey)
   * are left with taskCode unset. Returns how many rows were (re)coded.
   */
  async assignTaskCodesForProject(projectName: string): Promise<number> {
    const tasks = await this.taskRepository.find({ where: { projectName }, order: { createdAt: 'ASC' } });

    const epics = tasks.filter((t) => t.issueType === 'Epic' && t.jiraIssueKey);
    const stories = tasks.filter((t) => t.issueType === 'Story' && t.jiraIssueKey);
    const leaves = tasks.filter((t) => t.issueType !== 'Epic' && t.issueType !== 'Story');

    const updates: { id: string; taskCode: string }[] = [];

    const epicNumberByKey = this.numberEpics(epics, updates);
    const storyNumberByKey = this.numberStories(stories, epicNumberByKey, updates);
    this.codeLeaves(leaves, epicNumberByKey, storyNumberByKey, updates);

    for (const update of updates) {
      await this.taskRepository.update(update.id, { taskCode: update.taskCode });
    }
    return updates.length;
  }

  /** Epic-{e} for every Epic, oldest-created first. Returns each Epic's own jiraIssueKey -> its number. */
  private numberEpics(epics: TaskRecord[], updates: { id: string; taskCode: string }[]): Map<string, number> {
    const epicNumberByKey = new Map<string, number>();
    epics.forEach((epic, index) => {
      const epicNumber = index + 1;
      epicNumberByKey.set(epic.jiraIssueKey as string, epicNumber);
      updates.push({ id: epic.id, taskCode: `Epic-${epicNumber}` });
    });
    return epicNumberByKey;
  }

  /** US-{e}.{s} for every Story with a resolvable Epic, oldest-created first within each Epic. Returns each Story's own jiraIssueKey -> its number. */
  private numberStories(
    stories: TaskRecord[],
    epicNumberByKey: Map<string, number>,
    updates: { id: string; taskCode: string }[],
  ): Map<string, number> {
    const storiesByEpicKey = new Map<string, TaskRecord[]>();
    for (const story of stories) {
      if (!story.epicKey || !epicNumberByKey.has(story.epicKey)) {
        continue; // dangling epicKey — leave uncoded rather than guess
      }
      const list = storiesByEpicKey.get(story.epicKey) ?? [];
      list.push(story);
      storiesByEpicKey.set(story.epicKey, list);
    }

    const storyNumberByKey = new Map<string, number>();
    for (const [epicKey, epicStories] of storiesByEpicKey) {
      const epicNumber = epicNumberByKey.get(epicKey) as number;
      epicStories.forEach((story, index) => {
        const storyNumber = index + 1;
        storyNumberByKey.set(story.jiraIssueKey as string, storyNumber);
        updates.push({ id: story.id, taskCode: `US-${epicNumber}.${storyNumber}` });
      });
    }
    return storyNumberByKey;
  }

  /** Task/Bug/Sub-task codes for every leaf with a resolvable Epic, grouped by epicKey::storyKey and walked in creation-date order — see resolveLeafCode for the per-leaf rule. */
  private codeLeaves(
    leaves: TaskRecord[],
    epicNumberByKey: Map<string, number>,
    storyNumberByKey: Map<string, number>,
    updates: { id: string; taskCode: string }[],
  ): void {
    const leavesByGroupKey = new Map<string, TaskRecord[]>();
    for (const leaf of leaves) {
      if (!leaf.epicKey || !epicNumberByKey.has(leaf.epicKey)) {
        continue; // no resolvable Epic — leave uncoded
      }
      const groupKey = `${leaf.epicKey}::${leaf.storyKey ?? ''}`;
      const list = leavesByGroupKey.get(groupKey) ?? [];
      list.push(leaf);
      leavesByGroupKey.set(groupKey, list);
    }

    for (const [groupKey, groupLeaves] of leavesByGroupKey) {
      const [epicKey, storyKey] = groupKey.split('::');
      const epicNumber = epicNumberByKey.get(epicKey) as number;
      const storyNumber = storyKey ? storyNumberByKey.get(storyKey) ?? 0 : 0;

      let taskSlot = 0;
      let siblingCounter = 0;
      const taskSlotByJiraKey = new Map<string, number>();
      const subtaskCounterByParentKey = new Map<string, number>();
      for (const leaf of groupLeaves) {
        const resolved = this.resolveLeafCode(
          leaf,
          epicNumber,
          storyNumber,
          taskSlot,
          siblingCounter,
          taskSlotByJiraKey,
          subtaskCounterByParentKey,
        );
        taskSlot = resolved.taskSlot;
        siblingCounter = resolved.siblingCounter;
        if (resolved.code) {
          updates.push({ id: leaf.id, taskCode: resolved.code });
        }
      }
    }
  }

  /**
   * One leaf's code plus the group's updated taskSlot/siblingCounter
   * counters — extracted from assignTaskCodesForProject's leaf loop to keep
   * each piece's complexity manageable. `taskSlotByJiraKey` is filled in as
   * Tasks are visited (in creation-date order, same as everything else here)
   * so a later Sub-task in the same group can look up its real parent
   * Task's exact {t} instead of approximating. `subtaskCounterByParentKey`
   * counts Sub-tasks per parent Task (not per group), so two Sub-tasks under
   * the same Task get distinct {n} (SubTask-{e}.{s}.{t}.1, .2, ...) while
   * still landing on their parent Task's exact {t}.
   */
  private resolveLeafCode(
    leaf: TaskRecord,
    epicNumber: number,
    storyNumber: number,
    taskSlot: number,
    siblingCounter: number,
    taskSlotByJiraKey: Map<string, number>,
    subtaskCounterByParentKey: Map<string, number>,
  ): { code: string | null; taskSlot: number; siblingCounter: number } {
    const prefix = leaf.issueType ? ISSUE_CODE_PREFIX[leaf.issueType] : undefined;
    if (!prefix) {
      return { code: null, taskSlot, siblingCounter }; // unrecognized/no issue type — leave uncoded
    }

    if (leaf.issueType === 'Task') {
      const nextTaskSlot = taskSlot + 1;
      if (leaf.jiraIssueKey) {
        taskSlotByJiraKey.set(leaf.jiraIssueKey, nextTaskSlot);
      }
      return { code: `Task-${epicNumber}.${storyNumber}.${nextTaskSlot}`, taskSlot: nextTaskSlot, siblingCounter: 0 };
    }

    if (leaf.issueType === 'Sub-task' && leaf.parentTaskKey && taskSlotByJiraKey.has(leaf.parentTaskKey)) {
      const parentTaskSlot = taskSlotByJiraKey.get(leaf.parentTaskKey) as number;
      const nextSubtaskNumber = (subtaskCounterByParentKey.get(leaf.parentTaskKey) ?? 0) + 1;
      subtaskCounterByParentKey.set(leaf.parentTaskKey, nextSubtaskNumber);
      return {
        code: `SubTask-${epicNumber}.${storyNumber}.${parentTaskSlot}.${nextSubtaskNumber}`,
        taskSlot,
        siblingCounter,
      };
    }

    const nextSiblingCounter = siblingCounter + 1;
    return {
      code: `${prefix}-${epicNumber}.${storyNumber}.${taskSlot}.${nextSiblingCounter}`,
      taskSlot,
      siblingCounter: nextSiblingCounter,
    };
  }
}
