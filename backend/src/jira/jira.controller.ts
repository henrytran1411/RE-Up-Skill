import { Body, Controller, Get, Post, Put } from '@nestjs/common';
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

  /** Triggers a sync of the selected project(s) now — there is no automatic/daily sync. */
  @Post('run')
  run() {
    return this.jiraService.syncTasksFromJira();
  }

  /** Recent sync runs — the only visibility into what past manual syncs actually did. */
  @Get('logs')
  findLogs() {
    return this.jiraService.findRecentLogs();
  }
}
