import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { JiraService } from './jira.service';
import { UpsertJiraConfigDto } from './dto/upsert-jira-config.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

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
}
