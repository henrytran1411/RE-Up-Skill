import { BadRequestException, Body, Controller, Get, Param, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JiraService } from './jira.service';
import { UpsertJiraConfigDto } from './dto/upsert-jira-config.dto';
import { CreateJiraIssueDto } from './dto/create-jira-issue.dto';
import { PushProjectToJiraDto } from './dto/push-project-to-jira.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

const CSV_UPLOAD_OPTIONS = {
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
    if (!file.originalname.toLowerCase().endsWith('.csv') && file.mimetype !== 'text/csv') {
      callback(new BadRequestException('Only .csv files are allowed'), false);
      return;
    }
    callback(null, true);
  },
};

@Controller('jira-sync')
@Roles(Role.ADMIN)
export class JiraController {
  constructor(private readonly jiraService: JiraService) {}

  /** Masked connection summary for the Admin page — never includes the token. */
  @Get('config')
  getConfig() {
    return this.jiraService.getConfigSummary();
  }

  /** Saves the Jira connection (baseUrl/email/apiToken + optional projectKeys/storyPointsField). Omit apiToken to keep the stored one. */
  @Put('config')
  upsertConfig(@Body() dto: UpsertJiraConfigDto) {
    return this.jiraService.upsertConfig(dto);
  }

  /** Every project the saved Jira account can see — populates the project picker on the Admin page. */
  @Get('projects')
  listProjects() {
    return this.jiraService.listProjects();
  }

  /** Every user the saved Jira account can see — populates the "Jira Users → Employees" mapping picker on the Admin page. */
  @Get('users')
  listUsers() {
    return this.jiraService.listUsers();
  }

  /** Triggers a sync of the selected project(s) now — there is no automatic/daily sync. */
  @Post('run')
  run() {
    return this.jiraService.syncTasksFromJira();
  }

  /**
   * Syncs exactly one Jira project by key, independent of the Admin page's
   * stored project selection, then recomputes taskCode for every issue in
   * it (Epic-1/US-1.1/Task-1.1.1/Bug-1.1.1.1/SubTask-1.1.1.1).
   */
  @Post('run/:projectKey')
  runSingleProject(@Param('projectKey') projectKey: string) {
    return this.jiraService.syncSingleProjectFromJira(projectKey);
  }

  /** Ensures a Project row exists for every Jira project in scope — the project analog of run() above, for keeping the Projects list itself in sync. */
  @Post('run-projects')
  runProjects() {
    return this.jiraService.syncProjectsFromJira();
  }

  /** Recent sync runs — the only visibility into what past manual syncs actually did. */
  @Get('logs')
  findLogs() {
    return this.jiraService.findRecentLogs();
  }

  /** Creates one brand-new issue directly in real Jira — a live, visible write, unlike every read above. */
  @Post('create-issue')
  createIssue(@Body() dto: CreateJiraIssueDto) {
    return this.jiraService.createIssue(dto);
  }

  /**
   * Bulk-creates issues, all in one Jira project (picked on the Admin page,
   * not per-row), from an uploaded CSV (columns:
   * summary,issueType,assigneeAccountId,parentKey,storyPoints,description).
   * Runs row by row so one bad row doesn't sink the whole batch — check each
   * result's success/errorMessage rather than assuming an all-or-nothing outcome.
   */
  @Post('create-issues-bulk')
  @UseInterceptors(FileInterceptor('file', CSV_UPLOAD_OPTIONS))
  createIssuesBulk(@UploadedFile() file: Express.Multer.File, @Body('projectKey') projectKey: string) {
    if (!file) {
      throw new BadRequestException('A .csv file is required');
    }
    if (!projectKey) {
      throw new BadRequestException('A project is required');
    }
    const dtos = this.jiraService.parseCreateIssuesCsv(file.buffer.toString('utf-8'), projectKey);
    return this.jiraService.createIssuesBulk(dtos);
  }

  /** Pushes every task in a local Project that isn't already in Jira into the given Jira project as real issues — a live, visible write. */
  @Post('push-project')
  pushProject(@Body() dto: PushProjectToJiraDto) {
    return this.jiraService.pushProjectTasksToJira(dto.projectName, dto.jiraProjectKey);
  }

  /**
   * Every Epic and User Story currently in a Jira project — read-only, so
   * open to the same PM/Tech Lead/Admin audience as the Backlog Generator's
   * document-import flow, overriding this controller's class-level
   * Admin-only default (every other route here is a live Jira write).
   */
  @Get('projects/:projectKey/epics-and-stories')
  @Roles(Role.ADMIN, Role.PM, Role.TECH_LEAD)
  listEpicsAndStories(@Param('projectKey') projectKey: string) {
    return this.jiraService.listEpicsAndStories(projectKey);
  }
}
