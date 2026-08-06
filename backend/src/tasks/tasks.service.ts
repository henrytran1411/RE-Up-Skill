import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { TaskRecord } from './entities/task-record.entity';
import { CreateTaskRecordDto } from './dto/create-task-record.dto';
import { CompleteTaskRecordDto } from './dto/complete-task-record.dto';
import { UpdateTaskRecordDto } from './dto/update-task-record.dto';
import { EmployeesService } from '../employees/employees.service';
import { ProjectsService } from '../projects/projects.service';
import { ProjectSprintsService } from '../projects/project-sprints.service';
import { ProjectContributionsService } from '../projects/project-contributions.service';
import { Role } from '../common/enums/role.enum';
import { ProjectStatus } from '../common/enums/project-status.enum';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { computeTaskScore } from '../evaluations/scoring/scoring.util';
import { ProjectHealthService, ProjectHealthReport } from './project-health.service';
import { TaskCriticalPathService, TaskCriticalPathReport } from './task-critical-path.service';
import { TaskStatus } from '../common/enums/task-status.enum';
import { ProjectBoardType } from '../common/enums/project-board-type.enum';

/** Standard working hours in a month (8h/day x 20 workdays), used to derive an hourly cost rate from monthly salary. */
const STANDARD_MONTHLY_HOURS = 160;

/** Net available working hours in a year: 22 workdays/month x 8h x 12 months, minus 20 days x 8h of annual leave/holidays. */
const STANDARD_ANNUAL_WORKING_HOURS = 22 * 8 * 12 - 20 * 8;

/** Roles allowed to see revenue/cost/ROI figures. PM is deliberately excluded — see findProjectOverview. */
const ROI_VISIBLE_ROLES: Role[] = [Role.ADMIN, Role.HR, Role.TECH_LEAD];

/** No progress yet (including no tasks at all) is PENDING; partial progress is PROCESSING; every task done is COMPLETED. */
function computeProjectStatus(taskCount: number, completedTaskCount: number): ProjectStatus {
  if (taskCount === 0 || completedTaskCount === 0) {
    return ProjectStatus.PENDING;
  }
  if (completedTaskCount === taskCount) {
    return ProjectStatus.COMPLETED;
  }
  return ProjectStatus.PROCESSING;
}

export interface ProjectHistoryEntry {
  projectName: string;
  tasks: TaskRecord[];
  employeePoints: number;
  totalProjectPoints: number;
  /** employeePoints / totalProjectPoints * 100, rounded to 2 decimals. */
  effortPercent: number;
  /** Earliest createdAt among this employee's tasks on this project. */
  startDate: string;
  /** Latest completedAt, only once every one of this employee's tasks on this project is done; null while still in progress. */
  endDate: string | null;
}

export interface EmployeeTaskScore {
  employeeId: string;
  /** Calendar year this score was computed over. */
  year: number;
  /** 0-100, see computeTaskScore — blends PM rating, on-time delivery, and complexity across tasks completed in `year`. */
  taskScore: number;
  completedTaskCount: number;
  /** Sum of `points` across every project, for tasks completed in `year`. */
  totalPoints: number;
  /** Sum of `estimateHours` across every project, for tasks completed in `year`. */
  estimatedHours: number;
  /** estimatedHours / STANDARD_ANNUAL_WORKING_HOURS * 100 — how much of a full year's capacity this represents. Can exceed 100. */
  workloadPercent: number;
  /** Sum of `actualHours` across every project, for tasks completed in `year`. */
  actualHours: number;
  /** actualHours / STANDARD_ANNUAL_WORKING_HOURS * 100 — how much of a full year's capacity was actually spent. Can exceed 100. */
  actualWorkloadPercent: number;
}

export interface ProjectSummary {
  projectName: string;
  managerId: string | null;
  managerName: string | null;
  status: ProjectStatus;
  taskCount: number;
  completedTaskCount: number;
  contributorCount: number;
  totalPoints: number;
  /** Sum of `points` across only completed tasks — points actually delivered so far, vs. totalPoints' full planned scope. */
  totalActualPoints: number;
  totalEstimateHours: number;
  totalActualHours: number;
  startDate: string | null;
  targetEndDate: string | null;
  /** Kanban vs. Agile — Kanban means the project has no Sprint tab. */
  projectBoardType: ProjectBoardType;
  /** The real Jira project this maps to, if any — set via PUT /projects/:name/jira-mapping, a prerequisite for syncing task summaries to Jira. */
  jiraProjectKey: string | null;
}

export interface PublicProjectContributor {
  employeeId: string;
  employeeName: string;
  taskCount: number;
  points: number;
  estimateHours: number;
  actualHours: number;
  /** This contributor's share of the project, computed three different ways. */
  pointsEffortPercent: number;
  estimateEffortPercent: number;
  actualEffortPercent: number;
}

export interface ProjectContributor extends PublicProjectContributor {
  /** ROI inputs/outputs — null when the employee has no salary on file. */
  totalSalary: number | null;
  hoursSpent: number;
  cost: number | null;
  revenueShare: number;
  netContribution: number | null;
  roiPercent: number | null;
}

export interface PublicProjectOverview extends ProjectSummary {
  contributors: PublicProjectContributor[];
}

export interface ProjectOverview extends ProjectSummary {
  revenue: number;
  totalCost: number;
  netProfit: number;
  roiPercent: number | null;
  /** Contributors with no salary on file — excluded from totalCost, so it may understate reality. */
  contributorsMissingSalaryCount: number;
  contributors: ProjectContributor[];
}

function percentOf(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 10000) / 100 : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPublicContributor(c: ProjectContributor): PublicProjectContributor {
  return {
    employeeId: c.employeeId,
    employeeName: c.employeeName,
    taskCount: c.taskCount,
    points: c.points,
    estimateHours: c.estimateHours,
    actualHours: c.actualHours,
    pointsEffortPercent: c.pointsEffortPercent,
    estimateEffortPercent: c.estimateEffortPercent,
    actualEffortPercent: c.actualEffortPercent,
  };
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(TaskRecord)
    private readonly taskRepository: Repository<TaskRecord>,
    private readonly employeesService: EmployeesService,
    private readonly projectsService: ProjectsService,
    private readonly projectSprintsService: ProjectSprintsService,
    private readonly projectContributionsService: ProjectContributionsService,
    private readonly projectHealthService: ProjectHealthService,
    private readonly taskCriticalPathService: TaskCriticalPathService,
  ) {}

  /** PM may only touch tasks on a project they're the assigned manager of; other mutating roles are unrestricted. */
  private async ensurePmManagesProject(requester: AuthenticatedUser, projectName: string): Promise<void> {
    if (requester.role !== Role.PM) {
      return;
    }
    const project = await this.projectsService.findByName(projectName);
    if (project?.managerId !== requester.employeeId) {
      throw new ForbiddenException('You can only manage tasks for projects you manage');
    }
  }

  /** Every blockedByTaskIds entry must be a real task in the same project; `excludeId` (when editing) may not appear in its own list. */
  private async validateBlockedByTaskIds(
    projectName: string,
    blockedByTaskIds: string[],
    excludeId?: string,
  ): Promise<void> {
    if (excludeId && blockedByTaskIds.includes(excludeId)) {
      throw new BadRequestException('A task cannot depend on itself');
    }
    if (blockedByTaskIds.length === 0) {
      return;
    }
    const projectTasks = await this.taskRepository.find({ where: { projectName } });
    const validIds = new Set(projectTasks.map((t) => t.id));
    const unknownIds = blockedByTaskIds.filter((id) => !validIds.has(id));
    if (unknownIds.length > 0) {
      throw new BadRequestException(`Not a task in this project: ${unknownIds.join(', ')}`);
    }
  }

  async create(dto: CreateTaskRecordDto, requester: AuthenticatedUser): Promise<TaskRecord> {
    await this.ensurePmManagesProject(requester, dto.projectName);
    if (dto.blockedByTaskIds) {
      await this.validateBlockedByTaskIds(dto.projectName, dto.blockedByTaskIds);
    }
    const task = this.taskRepository.create(dto);
    if (dto.status !== undefined) {
      task.completedAt = dto.status === TaskStatus.COMPLETED ? todayIso() : null;
    }
    return this.taskRepository.save(task);
  }

  /** Raw task list for one project — the editable rows behind a PM's task management view. */
  async findTasksForProject(projectName: string, requester: AuthenticatedUser): Promise<TaskRecord[]> {
    await this.ensurePmManagesProject(requester, projectName);
    return this.taskRepository.find({
      where: { projectName },
      relations: ['employee'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Sprint burndown + Epic critical-path health check for one project — see
   * ProjectHealthService for the actual computation. Sprint 1 is anchored to
   * the project's own earliest task, so a projected finish date can be
   * derived purely from sprint counts without a separate "project start"
   * field.
   */
  async getProjectHealth(projectName: string, requester: AuthenticatedUser): Promise<ProjectHealthReport> {
    await this.ensurePmManagesProject(requester, projectName);
    const [project, tasks, sprints] = await Promise.all([
      this.projectsService.findByName(projectName),
      this.taskRepository.find({ where: { projectName }, order: { createdAt: 'ASC' } }),
      this.projectSprintsService.findAllForProject(projectName),
    ]);

    const sprintStartDate =
      tasks.length > 0
        ? tasks.reduce((min, t) => (t.createdAt < min ? t.createdAt : min), tasks[0].createdAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

    const sprintNumberByProjectSprintId = new Map(sprints.map((s) => [s.id, s.sprintNumber]));
    return this.projectHealthService.compute(
      tasks,
      sprintNumberByProjectSprintId,
      sprintStartDate,
      project?.targetEndDate ?? null,
    );
  }

  async updateTask(id: string, dto: UpdateTaskRecordDto, requester: AuthenticatedUser): Promise<TaskRecord> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.ensurePmManagesProject(requester, task.projectName);
    if (dto.projectName !== undefined && dto.projectName !== task.projectName) {
      await this.ensurePmManagesProject(requester, dto.projectName);
    }
    if (dto.blockedByTaskIds) {
      await this.validateBlockedByTaskIds(dto.projectName ?? task.projectName, dto.blockedByTaskIds, id);
    }

    // A status change is the source of truth for completedAt — every rollup/critical-path/scoring
    // calculation reads completedAt, not status, as the "is this done" signal, so keep them in sync:
    // moving to COMPLETED stamps it (today if not given explicitly), moving away clears it. Passing
    // `undefined` here is a no-op to TypeORM's update(), so a plain completedAt edit with no status
    // change behaves exactly as before.
    const completedAt: string | null | undefined =
      dto.status === undefined
        ? dto.completedAt
        : dto.status === TaskStatus.COMPLETED
          ? dto.completedAt ?? task.completedAt ?? todayIso()
          : null;

    await this.taskRepository.update(id, { ...dto, completedAt });
    return this.taskRepository.findOneOrFail({ where: { id } });
  }

  /**
   * Task-level critical path across every leaf task in the project — driven
   * by blockedByTaskIds, distinct from getProjectHealth's Epic-level one
   * (driven by blockedByIssues/blockedByEpicKeys). See TaskCriticalPathService.
   */
  async getTaskCriticalPath(projectName: string, requester: AuthenticatedUser): Promise<TaskCriticalPathReport> {
    await this.ensurePmManagesProject(requester, projectName);
    const tasks = await this.taskRepository.find({ where: { projectName } });
    return this.taskCriticalPathService.compute(tasks);
  }

  /**
   * A taskName's leading bracketed hierarchy code, if any — any word
   * (Epic/US/Task/Bug/ReOpen/Enhance/CR/SubTask/...) followed by dash and
   * dotted numbers, e.g. "[Epic-1]", "[US-1.1]", "[SubTask-3.2.2.1]", plus
   * any following space. Deliberately not a fixed word list — real data
   * already includes types like "SubTask" beyond the ones named in this
   * feature's spec. Matched (not just tested) so the existing prefix can be
   * stripped and replaced — taskCode can be reassigned later (e.g. a Jira
   * re-sync's full taskCode recompute renumbers Epics by creation order), so
   * a taskName's embedded prefix can go stale and no longer match its own
   * task's current taskCode; merely checking "has *a* prefix" would leave
   * that stale text in place forever instead of correcting it.
   */
  private static readonly SUMMARY_PREFIX_PATTERN = /^\[[A-Za-z]+-[\d.]+\]\s*/;

  /**
   * Makes every task's summary (taskName) in the project start with
   * `[${taskCode}]`, adding it if missing and correcting it if it's stale
   * (from taskCode having since been reassigned) — e.g. "Fix login bug"
   * with taskCode "Bug-1.1.1.1" becomes "[Bug-1.1.1.1] Fix login bug", and a
   * name already carrying a different code, however it appears, gets that
   * code swapped for the current one. A task with no taskCode is left
   * untouched, since there's nothing to prefix it with. Returns how many
   * rows were updated (already-correct rows don't count).
   */
  async syncTaskNamePrefixesForProject(projectName: string, requester: AuthenticatedUser): Promise<{ updatedCount: number }> {
    await this.ensurePmManagesProject(requester, projectName);
    const tasks = await this.taskRepository.find({ where: { projectName } });

    let updatedCount = 0;
    for (const task of tasks) {
      if (!task.taskCode) {
        continue;
      }
      const bareName = task.taskName.replace(TasksService.SUMMARY_PREFIX_PATTERN, '').trim();
      const correctedName = `[${task.taskCode}] ${bareName}`;
      if (correctedName === task.taskName) {
        continue;
      }
      await this.taskRepository.update(task.id, { taskName: correctedName });
      updatedCount += 1;
    }
    return { updatedCount };
  }

  /**
   * Resolves each task's Jira-sourced blockedByIssues (raw issue-key refs,
   * already captured for every issue type during sync) into blockedByTaskIds
   * — this project's own TaskRecord ids — wherever the blocking issue is
   * itself a synced task in the same project. A task can be blocked by more
   * than one other task, so every matching ref is kept, not just the first.
   * Only fills in tasks that don't already carry a blockedByTaskIds value,
   * so a PM's manual edits (or a previous run of this same pass) survive a
   * re-sync rather than being overwritten. Called once per Jira sync — see
   * JiraService.syncSingleProjectFromJira — after every issue in the batch
   * has been persisted, since a blocker can be any issue in the project, not
   * just one already seen earlier in this same run. Returns how many rows
   * got a new blockedByTaskIds value. Epic/Story issues are skipped — their
   * blockedByIssues may hold Epic-level dependencies set via
   * setEpicDependencies, which drive the separate Epic-level critical path
   * (getProjectHealth) and shouldn't leak into this task-level one.
   */
  async resolveBlockedByTaskIdsForProject(projectName: string): Promise<number> {
    const tasks = await this.taskRepository.find({ where: { projectName } });
    const idByJiraKey = new Map(
      tasks.filter((t) => t.jiraIssueKey !== null).map((t) => [t.jiraIssueKey as string, t.id]),
    );

    let resolvedCount = 0;
    for (const task of tasks) {
      if (task.issueType === 'Epic' || task.issueType === 'Story' || task.blockedByTaskIds.length > 0) {
        continue;
      }
      const blockerIds = [
        ...new Set(
          task.blockedByIssues
            .map((ref) => idByJiraKey.get(ref.key))
            .filter((blockerId): blockerId is string => blockerId !== undefined && blockerId !== task.id),
        ),
      ];
      if (blockerIds.length > 0) {
        await this.taskRepository.update(task.id, { blockedByTaskIds: blockerIds });
        resolvedCount++;
      }
    }
    return resolvedCount;
  }

  /**
   * A Task with 1+ Sub-tasks (matched by TaskRecord.parentTaskKey, resolved
   * during Jira sync — see JiraService.resolveParentTaskKey) no longer
   * carries its own independently-sourced estimateHours/actualHours/points —
   * they're zeroed out (points/estimateHours to 0, actualHours to null),
   * exactly the same "roll up from children instead of carrying its own"
   * treatment Epic/Story already get, extended one level down. This is
   * deliberately NOT "store the sum on the Task too": every project/employee
   * total in this codebase (findProjectOverview, findAllProjectsOverview,
   * findProjectHistoryForEmployee, toEmployeeTaskScore, ...) does a raw
   * SUM()/reduce() over every TaskRecord row with no issueType filtering —
   * if the Task also stored the sum, its Sub-tasks' points/hours would be
   * counted twice in every one of those. The Task's effective total is
   * still shown correctly wherever it's read through the hierarchy — see
   * buildTaskHierarchy's rollupPoints/rollupEstimateHours/rollupActualHours,
   * computed live from children the same way it already is for Epic/Story.
   * A Task with no Sub-tasks is left untouched — it keeps whatever value it
   * was directly given. Called once per Jira sync — see
   * JiraService.syncSingleProjectFromJira — after every issue in the batch
   * has been persisted, since a Task's Sub-tasks may sync before or after
   * it in the same batch. Returns how many Tasks were (re)zeroed
   * (already-zeroed ones don't count).
   */
  async recalculateTaskRollupsForProject(projectName: string): Promise<number> {
    const tasks = await this.taskRepository.find({ where: { projectName } });
    const taskByJiraKey = new Map(
      tasks.filter((t) => t.issueType === 'Task' && t.jiraIssueKey !== null).map((t) => [t.jiraIssueKey as string, t]),
    );

    const parentKeysWithSubtasks = new Set(
      tasks.filter((t) => t.issueType === 'Sub-task' && t.parentTaskKey !== null).map((t) => t.parentTaskKey as string),
    );

    let updatedCount = 0;
    for (const parentTaskKey of parentKeysWithSubtasks) {
      const task = taskByJiraKey.get(parentTaskKey);
      if (!task) {
        continue; // parent Task not in this project (or not a Task) — nothing to zero out
      }

      if (task.estimateHours === 0 && task.actualHours === null && task.points === 0) {
        continue;
      }
      task.estimateHours = 0;
      task.actualHours = null;
      task.points = 0;
      await this.taskRepository.save(task);
      updatedCount += 1;
    }
    return updatedCount;
  }

  /**
   * Sets which other Epics (by their own jiraIssueKey) must finish before
   * this one can — the input the health check's longest-chain critical-path
   * calculation runs on. Any existing blockedByIssues entries that don't
   * point at an Epic in this project (e.g. a bug link) are left untouched.
   */
  async setEpicDependencies(
    id: string,
    blockedByEpicKeys: string[],
    requester: AuthenticatedUser,
  ): Promise<TaskRecord> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.ensurePmManagesProject(requester, task.projectName);
    if (task.issueType !== 'Epic') {
      throw new BadRequestException('Only Epic issues can have critical-path dependencies');
    }
    if (blockedByEpicKeys.includes(task.jiraIssueKey as string)) {
      throw new BadRequestException('An Epic cannot depend on itself');
    }

    const projectEpics = await this.taskRepository.find({
      where: { projectName: task.projectName, issueType: 'Epic' },
    });
    const epicByKey = new Map(
      projectEpics.filter((e) => e.jiraIssueKey !== null).map((e) => [e.jiraIssueKey as string, e]),
    );
    const unknownKeys = blockedByEpicKeys.filter((key) => !epicByKey.has(key));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(`Not an Epic in this project: ${unknownKeys.join(', ')}`);
    }

    const preservedRefs = task.blockedByIssues.filter((ref) => !epicByKey.has(ref.key));
    const epicRefs = blockedByEpicKeys.map((key) => ({
      key,
      summary: epicByKey.get(key)!.taskName,
      issueType: 'Epic',
    }));
    task.blockedByIssues = [...preservedRefs, ...epicRefs];
    return this.taskRepository.save(task);
  }

  async removeTask(id: string, requester: AuthenticatedUser): Promise<void> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.ensurePmManagesProject(requester, task.projectName);
    await this.taskRepository.remove(task);
  }

  findForEmployee(employeeId: string): Promise<TaskRecord[]> {
    return this.taskRepository.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  findForEmployeeInPeriod(employeeId: string, periodStart: string, periodEnd: string): Promise<TaskRecord[]> {
    return this.taskRepository.find({
      where: { employeeId, completedAt: Between(periodStart, periodEnd) },
    });
  }

  /**
   * Every project this employee has tasks on, each with their task list and
   * an "effort percent" — this employee's points on that project divided by
   * the project's total points across every contributor. Reflects assigned
   * work, not just completed work, so in-flight tasks still count.
   */
  async findProjectHistoryForEmployee(employeeId: string): Promise<ProjectHistoryEntry[]> {
    const employeeTasks = await this.taskRepository.find({
      where: { employeeId },
      order: { projectName: 'ASC', createdAt: 'ASC' },
    });
    if (employeeTasks.length === 0) {
      return [];
    }

    const projectNames = [...new Set(employeeTasks.map((t) => t.projectName))];
    const projectTotals = await this.taskRepository
      .createQueryBuilder('t')
      .select('t.projectName', 'projectName')
      .addSelect('SUM(t.points)', 'totalPoints')
      .where('t.projectName IN (:...projectNames)', { projectNames })
      .groupBy('t.projectName')
      .getRawMany<{ projectName: string; totalPoints: string }>();
    const totalPointsByProject = new Map(projectTotals.map((p) => [p.projectName, Number(p.totalPoints)]));

    const tasksByProject = new Map<string, TaskRecord[]>();
    for (const task of employeeTasks) {
      const list = tasksByProject.get(task.projectName) ?? [];
      list.push(task);
      tasksByProject.set(task.projectName, list);
    }

    return Array.from(tasksByProject.entries()).map(([projectName, tasks]) => {
      const employeePoints = tasks.reduce((sum, t) => sum + t.points, 0);
      const totalProjectPoints = totalPointsByProject.get(projectName) ?? employeePoints;
      const effortPercent = percentOf(employeePoints, totalProjectPoints);

      const taskDates = tasks.map((t) => new Date(t.createdAt).toISOString().slice(0, 10));
      const startDate = taskDates.reduce((min, d) => (d < min ? d : min), taskDates[0]);
      const allCompleted = tasks.every((t) => t.completedAt !== null);
      const endDate = allCompleted
        ? tasks.reduce((max, t) => (t.completedAt! > max ? t.completedAt! : max), tasks[0].completedAt!)
        : null;

      return { projectName, tasks, employeePoints, totalProjectPoints, effortPercent, startDate, endDate };
    });
  }

  private toEmployeeTaskScore(employeeId: string, year: number, tasks: TaskRecord[]): EmployeeTaskScore {
    const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
    const estimatedHours = tasks.reduce((sum, t) => sum + t.estimateHours, 0);
    const actualHours = tasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);
    return {
      employeeId,
      year,
      taskScore: round2(computeTaskScore(tasks)),
      completedTaskCount: tasks.filter((t) => t.completedAt !== null && t.actualHours !== null).length,
      totalPoints,
      estimatedHours,
      workloadPercent: round2((estimatedHours / STANDARD_ANNUAL_WORKING_HOURS) * 100),
      actualHours,
      actualWorkloadPercent: round2((actualHours / STANDARD_ANNUAL_WORKING_HOURS) * 100),
    };
  }

  /** Task score (0-100) for tasks this employee completed in `year` (defaults to the current calendar year) — see computeTaskScore. */
  async findTaskScoreForEmployee(employeeId: string, year: number = new Date().getFullYear()): Promise<EmployeeTaskScore> {
    const tasks = await this.taskRepository.find({
      where: { employeeId, completedAt: Between(`${year}-01-01`, `${year}-12-31`) },
    });
    return this.toEmployeeTaskScore(employeeId, year, tasks);
  }

  /** Task score for one employee, one entry per calendar year they have completed tasks in, oldest first. */
  async findTaskScoreHistoryForEmployee(employeeId: string): Promise<EmployeeTaskScore[]> {
    const tasks = await this.taskRepository.find({ where: { employeeId } });

    const tasksByYear = new Map<number, TaskRecord[]>();
    for (const task of tasks) {
      if (!task.completedAt) {
        continue;
      }
      const year = Number(task.completedAt.slice(0, 4));
      const list = tasksByYear.get(year) ?? [];
      list.push(task);
      tasksByYear.set(year, list);
    }

    return Array.from(tasksByYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, yearTasks]) => this.toEmployeeTaskScore(employeeId, year, yearTasks));
  }

  /** Task score for every employee over `year` (defaults to the current calendar year), including those with none yet (score 0). */
  async findAllTaskScores(year: number = new Date().getFullYear()): Promise<EmployeeTaskScore[]> {
    const [employees, yearTasks] = await Promise.all([
      this.employeesService.findAll(),
      this.taskRepository.find({ where: { completedAt: Between(`${year}-01-01`, `${year}-12-31`) } }),
    ]);

    const tasksByEmployeeId = new Map<string, TaskRecord[]>();
    for (const task of yearTasks) {
      const list = tasksByEmployeeId.get(task.employeeId) ?? [];
      list.push(task);
      tasksByEmployeeId.set(task.employeeId, list);
    }

    return employees.map((employee) =>
      this.toEmployeeTaskScore(employee.id, year, tasksByEmployeeId.get(employee.id) ?? []),
    );
  }

  /**
   * One row per project — no per-employee or ROI breakdown, safe for any
   * manager role to see. Includes projects with no tasks yet (zeroed stats),
   * since a project can now be created explicitly before any work is logged
   * against it. A PM only sees projects they're assigned to manage; everyone
   * else sees the full list.
   */
  async findAllProjectsOverview(requester: AuthenticatedUser): Promise<ProjectSummary[]> {
    const rows = await this.taskRepository
      .createQueryBuilder('t')
      .select('t.projectName', 'projectName')
      .addSelect('COUNT(t.id)', 'taskCount')
      .addSelect('COUNT(t.id) FILTER (WHERE t.completedAt IS NOT NULL)', 'completedTaskCount')
      .addSelect('COUNT(DISTINCT t.employeeId)', 'contributorCount')
      .addSelect('SUM(t.points)', 'totalPoints')
      .addSelect('SUM(t.points) FILTER (WHERE t.completedAt IS NOT NULL)', 'totalActualPoints')
      .addSelect('SUM(t.estimateHours)', 'totalEstimateHours')
      .addSelect('SUM(t.actualHours)', 'totalActualHours')
      .groupBy('t.projectName')
      .getRawMany<Record<string, string>>();
    const statsByName = new Map(rows.map((r) => [r.projectName, r]));

    const projectRecords = await this.projectsService.findAll();
    const projectByName = new Map(projectRecords.map((p) => [p.name, p]));
    const allNames = [...new Set([...statsByName.keys(), ...projectByName.keys()])].sort((a, b) =>
      a.localeCompare(b),
    );

    const managerIds = [...new Set(projectRecords.map((p) => p.managerId).filter((id): id is string => id !== null))];
    const managerNames = await this.employeesService.findNamesByIds(managerIds);

    let summaries: ProjectSummary[] = allNames.map((projectName) => {
      const r = statsByName.get(projectName);
      const project = projectByName.get(projectName);
      const managerId = project?.managerId ?? null;
      const taskCount = r ? Number(r.taskCount) : 0;
      const completedTaskCount = r ? Number(r.completedTaskCount) : 0;
      return {
        projectName,
        managerId,
        managerName: managerId ? (managerNames.get(managerId) ?? null) : null,
        status: computeProjectStatus(taskCount, completedTaskCount),
        taskCount,
        completedTaskCount,
        contributorCount: r ? Number(r.contributorCount) : 0,
        totalPoints: r ? Number(r.totalPoints) || 0 : 0,
        totalActualPoints: r ? Number(r.totalActualPoints) || 0 : 0,
        totalEstimateHours: r ? Number(r.totalEstimateHours) || 0 : 0,
        totalActualHours: r ? Number(r.totalActualHours) || 0 : 0,
        startDate: project?.startDate ?? null,
        targetEndDate: project?.targetEndDate ?? null,
        projectBoardType: project?.projectBoardType ?? ProjectBoardType.AGILE,
        jiraProjectKey: project?.jiraProjectKey ?? null,
      };
    });

    if (requester.role === Role.PM) {
      summaries = summaries.filter((s) => s.managerId === requester.employeeId);
    }

    return summaries;
  }

  /**
   * Full detail for one project: totals across every task from every
   * employee, each contributor's effort share computed three ways (by
   * points, by estimated hours, by actual hours logged so far), and — for
   * roles allowed to see it — the ROI math: revenueShare = project revenue *
   * pointsEffortPercent; cost = (totalSalary / 160 standard hours) * hours
   * actually spent (falling back to estimate for still-in-progress tasks);
   * netContribution = revenueShare - cost.
   *
   * A PM may only view a project they're the assigned manager of, and never
   * sees revenue/cost/salary/ROI fields even for their own project — they
   * get the plain effort breakdown only.
   */
  async findProjectOverview(
    projectName: string,
    requester: AuthenticatedUser,
  ): Promise<ProjectOverview | PublicProjectOverview> {
    const project = await this.projectsService.findByName(projectName);

    if (requester.role === Role.PM && project?.managerId !== requester.employeeId) {
      throw new ForbiddenException('You can only view projects you manage');
    }

    const tasks = await this.taskRepository.find({
      where: { projectName },
      relations: ['employee'],
      order: { createdAt: 'ASC' },
    });
    if (!project && tasks.length === 0) {
      throw new NotFoundException(`Project "${projectName}" not found`);
    }

    const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
    const totalActualPoints = tasks.filter((t) => t.completedAt !== null).reduce((sum, t) => sum + t.points, 0);
    const totalEstimateHours = tasks.reduce((sum, t) => sum + t.estimateHours, 0);
    const totalActualHours = tasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);

    const tasksByEmployee = new Map<string, TaskRecord[]>();
    for (const task of tasks) {
      const list = tasksByEmployee.get(task.employeeId) ?? [];
      list.push(task);
      tasksByEmployee.set(task.employeeId, list);
    }

    const canViewRoi = ROI_VISIBLE_ROLES.includes(requester.role as Role);

    const [salariesByEmployeeId, managerNames] = await Promise.all([
      canViewRoi
        ? this.projectContributionsService.findRatesByEmployeeIds(Array.from(tasksByEmployee.keys()), projectName)
        : Promise.resolve(new Map<string, number | null>()),
      project?.managerId
        ? this.employeesService.findNamesByIds([project.managerId])
        : Promise.resolve(new Map<string, string>()),
    ]);
    const revenue = project?.revenue ?? 0;

    const contributors: ProjectContributor[] = Array.from(tasksByEmployee.entries())
      .map(([employeeId, empTasks]) => {
        const points = empTasks.reduce((sum, t) => sum + t.points, 0);
        const estimateHours = empTasks.reduce((sum, t) => sum + t.estimateHours, 0);
        const actualHours = empTasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);
        const pointsEffortPercent = percentOf(points, totalPoints);

        const totalSalary = salariesByEmployeeId.get(employeeId) ?? null;
        const hoursSpent = actualHours > 0 ? actualHours : estimateHours;
        const revenueShare = round2(revenue * (pointsEffortPercent / 100));

        let cost: number | null = null;
        let netContribution: number | null = null;
        let roiPercent: number | null = null;
        if (totalSalary !== null) {
          cost = round2((totalSalary / STANDARD_MONTHLY_HOURS) * hoursSpent);
          netContribution = round2(revenueShare - cost);
          roiPercent = cost > 0 ? percentOf(netContribution, cost) : null;
        }

        return {
          employeeId,
          employeeName: empTasks[0].employee?.fullName ?? employeeId,
          taskCount: empTasks.length,
          points,
          estimateHours,
          actualHours,
          pointsEffortPercent,
          estimateEffortPercent: percentOf(estimateHours, totalEstimateHours),
          actualEffortPercent: percentOf(actualHours, totalActualHours),
          totalSalary,
          hoursSpent,
          cost,
          revenueShare,
          netContribution,
          roiPercent,
        };
      })
      .sort((a, b) => b.points - a.points);

    const totalCost = round2(contributors.reduce((sum, c) => sum + (c.cost ?? 0), 0));
    const netProfit = round2(revenue - totalCost);

    const managerId = project?.managerId ?? null;
    const completedTaskCount = tasks.filter((t) => t.completedAt).length;
    const summary: ProjectSummary = {
      projectName,
      managerId,
      managerName: managerId ? (managerNames.get(managerId) ?? null) : null,
      status: computeProjectStatus(tasks.length, completedTaskCount),
      taskCount: tasks.length,
      completedTaskCount,
      contributorCount: contributors.length,
      totalPoints,
      totalActualPoints,
      totalEstimateHours,
      totalActualHours,
      startDate: project?.startDate ?? null,
      targetEndDate: project?.targetEndDate ?? null,
      projectBoardType: project?.projectBoardType ?? ProjectBoardType.AGILE,
      jiraProjectKey: project?.jiraProjectKey ?? null,
    };

    if (!canViewRoi) {
      return {
        ...summary,
        contributors: contributors.map(toPublicContributor),
      };
    }

    return {
      ...summary,
      revenue,
      totalCost,
      netProfit,
      roiPercent: totalCost > 0 ? percentOf(netProfit, totalCost) : null,
      contributorsMissingSalaryCount: contributors.filter((c) => c.totalSalary === null).length,
      contributors,
    };
  }

  async complete(id: string, dto: CompleteTaskRecordDto, requester: AuthenticatedUser): Promise<TaskRecord> {
    const task = await this.taskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException(`Task ${id} not found`);
    }
    await this.ensurePmManagesProject(requester, task.projectName);

    task.actualHours = dto.actualHours;
    task.completedAt = dto.completedAt;
    task.status = TaskStatus.COMPLETED;
    task.bugCount = dto.bugCount ?? task.bugCount;
    task.pmRating = dto.pmRating ?? task.pmRating;
    return this.taskRepository.save(task);
  }
}
