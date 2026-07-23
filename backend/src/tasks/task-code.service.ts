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
   * Bug-{e}.{s}.{t}.{n} / SubTask-{e}.{s}.{t}.{n} — deriving the {e}/{s}/{t}
   * numbers from each issue's own Jira creation date (oldest = 1), the same
   * convention used for the hand-seeded example data. A leaf directly under
   * an Epic with no Story uses `0` for {s} (e.g. Task-2.0.1).
   *
   * Bug/Sub-task don't have a real "which Task" link in typical Jira data
   * (Bugs especially are usually standalone, not literally sub-tasked), so
   * {t} is approximated as whichever Task most recently preceded them, by
   * creation date, within the same Story — the best available proxy for
   * "relates to that task" without an explicit link.
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

    const epicNumberByKey = new Map<string, number>();
    epics.forEach((epic, index) => {
      const epicNumber = index + 1;
      epicNumberByKey.set(epic.jiraIssueKey as string, epicNumber);
      updates.push({ id: epic.id, taskCode: `Epic-${epicNumber}` });
    });

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
      for (const leaf of groupLeaves) {
        const prefix = leaf.issueType ? ISSUE_CODE_PREFIX[leaf.issueType] : undefined;
        if (!prefix) {
          continue; // unrecognized/no issue type — leave uncoded
        }
        if (leaf.issueType === 'Task') {
          taskSlot += 1;
          siblingCounter = 0;
          updates.push({ id: leaf.id, taskCode: `Task-${epicNumber}.${storyNumber}.${taskSlot}` });
        } else {
          siblingCounter += 1;
          updates.push({ id: leaf.id, taskCode: `${prefix}-${epicNumber}.${storyNumber}.${taskSlot}.${siblingCounter}` });
        }
      }
    }

    for (const update of updates) {
      await this.taskRepository.update(update.id, { taskCode: update.taskCode });
    }
    return updates.length;
  }
}
