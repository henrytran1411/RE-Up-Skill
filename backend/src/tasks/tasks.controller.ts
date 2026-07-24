import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskRecordDto } from './dto/create-task-record.dto';
import { CompleteTaskRecordDto } from './dto/complete-task-record.dto';
import { UpdateTaskRecordDto } from './dto/update-task-record.dto';
import { SetEpicDependenciesDto } from './dto/set-epic-dependencies.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /** A PM may only create tasks on a project they're the assigned manager of. */
  @Post()
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  create(@Body() dto: CreateTaskRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.create(dto, user);
  }

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findForEmployee(user.employeeId);
  }

  /** Every project this employee has tasks on, with per-project effort percent. */
  @Get('me/project-history')
  findMyProjectHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findProjectHistoryForEmployee(user.employeeId);
  }

  @Get('employee/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findForEmployee(@Param('employeeId') employeeId: string) {
    return this.tasksService.findForEmployee(employeeId);
  }

  @Get('employee/:employeeId/project-history')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findProjectHistoryForEmployee(@Param('employeeId') employeeId: string) {
    return this.tasksService.findProjectHistoryForEmployee(employeeId);
  }

  /** Task score (0-100) for every employee, for tasks completed in `year` (defaults to the current calendar year). */
  @Get('task-score')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findAllTaskScores(@Query('year') year?: string) {
    return this.tasksService.findAllTaskScores(year ? Number(year) : undefined);
  }

  @Get('task-score/me')
  findMyTaskScore(@CurrentUser() user: AuthenticatedUser, @Query('year') year?: string) {
    return this.tasksService.findTaskScoreForEmployee(user.employeeId, year ? Number(year) : undefined);
  }

  /** One task score per calendar year the employee has completed tasks in — for the dashboard's history chart. */
  @Get('task-score/me/history')
  findMyTaskScoreHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findTaskScoreHistoryForEmployee(user.employeeId);
  }

  @Get('task-score/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findTaskScoreForEmployee(@Param('employeeId') employeeId: string, @Query('year') year?: string) {
    return this.tasksService.findTaskScoreForEmployee(employeeId, year ? Number(year) : undefined);
  }

  @Get('task-score/:employeeId/history')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findTaskScoreHistoryForEmployee(@Param('employeeId') employeeId: string) {
    return this.tasksService.findTaskScoreHistoryForEmployee(employeeId);
  }

  /**
   * One row per project — task/completion counts and totals, no ROI figures.
   * A PM only sees projects they manage; everyone else sees every project.
   */
  @Get('projects')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findAllProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findAllProjectsOverview(user);
  }

  /**
   * Full detail for one project: effort share by points/estimate/actual for
   * everyone, plus revenue/cost/ROI for roles allowed to see it (not PM). A
   * PM gets a 403 for any project they don't manage.
   */
  @Get('projects/:projectName')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findProjectOverview(@Param('projectName') projectName: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findProjectOverview(projectName, user);
  }

  /**
   * Raw, per-task rows for one project — the editable list behind task
   * management. A PM only sees this for a project they manage.
   */
  @Get('projects/:projectName/tasks')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findTasksForProject(@Param('projectName') projectName: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findTasksForProject(projectName, user);
  }

  /**
   * Sprint burndown + Epic critical-path health check for one project. A PM
   * only sees this for a project they manage.
   */
  @Get('projects/:projectName/health')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  getProjectHealth(@Param('projectName') projectName: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.getProjectHealth(projectName, user);
  }

  /**
   * Task-level critical path across every leaf task in the project — driven
   * by each task's own blockedByTaskIds, distinct from the Epic-level one at
   * GET .../health. A PM only sees this for a project they manage.
   */
  @Get('projects/:projectName/critical-path-tasks')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  getTaskCriticalPath(@Param('projectName') projectName: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.getTaskCriticalPath(projectName, user);
  }

  @Patch(':id/complete')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  complete(@Param('id') id: string, @Body() dto: CompleteTaskRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.complete(id, dto, user);
  }

  /** Sets which other Epics must finish before this one can — the Critical Path tab's input to the health check's critical-path calculation. */
  @Patch(':id/epic-dependencies')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  setEpicDependencies(
    @Param('id') id: string,
    @Body() dto: SetEpicDependenciesDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.tasksService.setEpicDependencies(id, dto.blockedByEpicKeys, user);
  }

  /** Edit any field on a task — a PM may only do so for a project they manage. */
  @Patch(':id')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateTaskRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.updateTask(id, dto, user);
  }

  /** A PM may only delete tasks on a project they manage. */
  @Delete(':id')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.removeTask(id, user);
  }
}
