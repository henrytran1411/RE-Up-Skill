import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskRecord, BlockedByIssueRef } from '../tasks/entities/task-record.entity';
import { JiraSyncLog, JiraSyncStatus } from './entities/jira-sync-log.entity';
import { JiraConfig } from './entities/jira-config.entity';
import { UpsertJiraConfigDto } from './dto/upsert-jira-config.dto';
import { EmployeesService } from '../employees/employees.service';
import { ProjectsService } from '../projects/projects.service';

/**
 * The subset of a Jira REST API v3 `/search/jql` result we actually read.
 * Note: `assignee` has no `emailAddress` here — Jira Cloud stopped exposing
 * other users' email over the REST API for a plain API-token caller
 * (GDPR/privacy change), so `accountId` is the only stable identifier
 * available for matching. Field names also vary a bit on Jira Server/Data
 * Center — this targets Jira Cloud.
 */
interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    created: string;
    resolutiondate?: string | null;
    project?: { name?: string };
    assignee?: { accountId?: string; displayName?: string } | null;
    priority?: { name?: string };
    status?: { statusCategory?: { key?: string } };
    timetracking?: { originalEstimateSeconds?: number; timeSpentSeconds?: number };
    issuetype?: { name?: string };
    issuelinks?: JiraIssueLink[];
    [customField: string]: unknown;
  };
}

interface JiraLinkedIssueRef {
  key: string;
  fields?: { summary?: string; issuetype?: { name?: string } };
}

/**
 * Jira represents a link's direction via its `type.inward`/`type.outward`
 * labels — e.g. for the standard "Blocks" link type, `inward: "is blocked
 * by"` and `outward: "blocks"`. An issue carrying `inwardIssue` in one of
 * these applies the *inward* label to that relationship, so `inwardIssue`
 * on a "Blocks" link is what blocks this issue (not the other way round).
 */
interface JiraIssueLink {
  type?: { name?: string; inward?: string; outward?: string };
  inwardIssue?: JiraLinkedIssueRef;
  outwardIssue?: JiraLinkedIssueRef;
}

interface JiraSearchResponse {
  issues: JiraIssue[];
  /** Opaque cursor for the next page — `/search/jql` replaced offset-based startAt/total pagination with this. */
  nextPageToken?: string;
  isLast: boolean;
}

interface JiraProjectSearchResponse {
  values: { id: string; key: string; name: string }[];
  isLast: boolean;
}

export interface JiraProjectSummary {
  id: string;
  key: string;
  name: string;
}

interface JiraApiUser {
  accountId: string;
  displayName: string;
  active: boolean;
  accountType: string;
}

export interface JiraUserSummary {
  accountId: string;
  displayName: string;
  active: boolean;
  /** 'atlassian' = a real person; 'app'/'customer' etc. are bots/service accounts — surfaced so the Admin page can filter them out. */
  accountType: string;
}

/** Resolved connection details for one sync run — always from the DB JiraConfig row (no env-var fallback). */
interface JiraConnection {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKeys: string[];
  syncAllProjects: boolean;
  storyPointsField: string;
}

export interface JiraConfigSummary {
  configured: boolean;
  baseUrl: string | null;
  email: string | null;
  projectKeys: string[];
  syncAllProjects: boolean;
  storyPointsField: string | null;
  updatedAt: Date | null;
}

export interface UnmatchedAssignee {
  accountId: string;
  displayName: string;
  issueCount: number;
}

export interface JiraSyncSummary {
  status: JiraSyncStatus;
  issuesFetched: number;
  tasksCreated: number;
  tasksUpdated: number;
  tasksSkipped: number;
  errorMessage: string | null;
  /** Assignees seen this run with no Employee.jiraAccountId mapped to them — map these via PATCH /employees/:id, then re-run. */
  unmatchedAssignees: UnmatchedAssignee[];
}

export interface JiraProjectSyncSummary {
  status: JiraSyncStatus;
  projectsFetched: number;
  projectsCreated: number;
  projectsUpdated: number;
  errorMessage: string | null;
}

/** Priority has no universal numeric scale in Jira — this is a judgment-call mapping, not a Jira standard. */
const PRIORITY_TO_COMPLEXITY: Record<string, number> = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
};
const DEFAULT_COMPLEXITY = 3;

/** Used when an issue has no original estimate logged in Jira — a guess, not a derived fact. */
const DEFAULT_ESTIMATE_HOURS = 4;
const DEFAULT_POINTS = 1;
const DEFAULT_STORY_POINTS_FIELD = 'customfield_10016';

const MAX_RESULTS_PER_PAGE = 100;
const MAX_PROJECTS_PER_PAGE = 50;
const MAX_USERS_PER_PAGE = 50;

@Injectable()
export class JiraService {
  private readonly logger = new Logger(JiraService.name);

  constructor(
    @InjectRepository(TaskRecord)
    private readonly taskRepository: Repository<TaskRecord>,
    @InjectRepository(JiraSyncLog)
    private readonly syncLogRepository: Repository<JiraSyncLog>,
    @InjectRepository(JiraConfig)
    private readonly configRepository: Repository<JiraConfig>,
    private readonly employeesService: EmployeesService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** The stored config, if any, WITHOUT the token — for display in the Admin UI (see getConfigSummary for the masked public shape). */
  private findStoredConfig(): Promise<JiraConfig | null> {
    return this.configRepository.findOne({ where: {} });
  }

  /** There is no env-var fallback — Jira sync is unconfigured until an Admin saves a connection on the Admin page. */
  private async resolveConnection(): Promise<JiraConnection | null> {
    const stored = await this.configRepository.createQueryBuilder('config').addSelect('config.apiToken').getOne();
    if (!stored) {
      return null;
    }
    return {
      baseUrl: stored.baseUrl,
      email: stored.email,
      apiToken: stored.apiToken,
      projectKeys: stored.projectKeys ?? [],
      syncAllProjects: stored.syncAllProjects,
      storyPointsField: stored.storyPointsField || DEFAULT_STORY_POINTS_FIELD,
    };
  }

  /** Masked view for the Admin UI — never includes the token. */
  async getConfigSummary(): Promise<JiraConfigSummary> {
    const stored = await this.findStoredConfig();
    if (!stored) {
      return {
        configured: false,
        baseUrl: null,
        email: null,
        projectKeys: [],
        syncAllProjects: false,
        storyPointsField: null,
        updatedAt: null,
      };
    }
    return {
      configured: true,
      baseUrl: stored.baseUrl,
      email: stored.email,
      projectKeys: stored.projectKeys ?? [],
      syncAllProjects: stored.syncAllProjects,
      storyPointsField: stored.storyPointsField,
      updatedAt: stored.updatedAt,
    };
  }

  /**
   * Creates or updates the single stored connection row. `apiToken` may be
   * omitted on an update to keep the currently-stored token unchanged —
   * it's required the first time, since there's nothing to fall back to.
   * `projectKeys`/`syncAllProjects` are only touched when present in the DTO
   * (undefined leaves the current value alone; [] explicitly clears the
   * project selection).
   */
  async upsertConfig(dto: UpsertJiraConfigDto): Promise<void> {
    let config = await this.findStoredConfig();
    if (!config) {
      if (!dto.apiToken) {
        throw new BadRequestException('apiToken is required when configuring Jira for the first time.');
      }
      config = this.configRepository.create();
    }

    config.baseUrl = dto.baseUrl;
    config.email = dto.email;
    if (dto.apiToken) {
      config.apiToken = dto.apiToken;
    }
    if (dto.projectKeys !== undefined) {
      config.projectKeys = dto.projectKeys;
    }
    if (dto.syncAllProjects !== undefined) {
      config.syncAllProjects = dto.syncAllProjects;
    }
    if (dto.storyPointsField !== undefined) {
      config.storyPointsField = dto.storyPointsField || null;
    }

    await this.configRepository.save(config);
  }

  private authHeader(connection: JiraConnection): string {
    const credentials = `${connection.email}:${connection.apiToken}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }

  /** Lists every project the saved Jira account can see — the picker the Admin page shows after a connection is saved. */
  async listProjects(): Promise<JiraProjectSummary[]> {
    const connection = await this.resolveConnection();
    if (!connection) {
      throw new BadRequestException('Save your Jira connection (base URL, email, API token) before loading projects.');
    }
    return this.fetchAllProjects(connection);
  }

  /** Paginates through every Jira project the connection's account can see. Shared by listProjects() and the sync-all-projects JQL builder below. */
  private async fetchAllProjects(connection: JiraConnection): Promise<JiraProjectSummary[]> {
    const baseUrl = connection.baseUrl.replace(/\/$/, '');
    const authHeader = this.authHeader(connection);
    const projects: JiraProjectSummary[] = [];
    let startAt = 0;
    for (;;) {
      const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(MAX_PROJECTS_PER_PAGE) });
      const response = await fetch(`${baseUrl}/rest/api/3/project/search?${params.toString()}`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Jira project search failed (${response.status}): ${await response.text()}`);
      }
      const page = (await response.json()) as JiraProjectSearchResponse;
      projects.push(...page.values.map((p) => ({ id: p.id, key: p.key, name: p.name })));
      if (page.isLast || page.values.length === 0) {
        break;
      }
      startAt += MAX_PROJECTS_PER_PAGE;
    }
    return projects;
  }

  /** Lists every Jira user the saved account can see — the picker behind the Admin page's "Jira Users → Employees" mapping. */
  async listUsers(): Promise<JiraUserSummary[]> {
    const connection = await this.resolveConnection();
    if (!connection) {
      throw new BadRequestException('Save your Jira connection (base URL, email, API token) before loading users.');
    }

    const baseUrl = connection.baseUrl.replace(/\/$/, '');
    const authHeader = this.authHeader(connection);
    const users: JiraUserSummary[] = [];
    let startAt = 0;
    for (;;) {
      const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(MAX_USERS_PER_PAGE) });
      const response = await fetch(`${baseUrl}/rest/api/3/users/search?${params.toString()}`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Jira user search failed (${response.status}): ${await response.text()}`);
      }
      const page = (await response.json()) as JiraApiUser[];
      users.push(...page.map((u) => ({ accountId: u.accountId, displayName: u.displayName, active: u.active, accountType: u.accountType })));
      if (page.length < MAX_USERS_PER_PAGE) {
        break;
      }
      startAt += MAX_USERS_PER_PAGE;
    }
    return users;
  }

  /** The Jira projects currently in scope — every project the account can see when syncAllProjects is on, else just the ones picked on the Admin page. */
  private async resolveScopedProjects(connection: JiraConnection): Promise<JiraProjectSummary[]> {
    const allProjects = await this.fetchAllProjects(connection);
    if (connection.syncAllProjects) {
      return allProjects;
    }
    const selectedKeys = new Set(connection.projectKeys);
    return allProjects.filter((project) => selectedKeys.has(project.key));
  }

  /** Paginates through every matching issue for one JQL query via the cursor-based /search/jql endpoint. */
  private async fetchIssues(jql: string, connection: JiraConnection): Promise<JiraIssue[]> {
    const baseUrl = connection.baseUrl.replace(/\/$/, '');
    const fields = [
      'summary',
      'created',
      'resolutiondate',
      'project',
      'assignee',
      'priority',
      'status',
      'timetracking',
      'issuetype',
      'issuelinks',
      connection.storyPointsField,
    ].join(',');
    const authHeader = this.authHeader(connection);

    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    for (;;) {
      const params = new URLSearchParams({ jql, maxResults: String(MAX_RESULTS_PER_PAGE), fields });
      if (nextPageToken) {
        params.set('nextPageToken', nextPageToken);
      }
      const response = await fetch(`${baseUrl}/rest/api/3/search/jql?${params.toString()}`, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Jira search failed (${response.status}): ${await response.text()}`);
      }
      const page = (await response.json()) as JiraSearchResponse;
      issues.push(...page.issues);
      if (page.isLast || page.issues.length === 0 || !page.nextPageToken) {
        break;
      }
      nextPageToken = page.nextPageToken;
    }
    return issues;
  }

  /** Jira issues that block this one — from "is blocked by" issue links (e.g. a Bug blocking a Task). See JiraIssueLink for the inward/outward direction convention. */
  private findBlockingIssues(issue: JiraIssue): BlockedByIssueRef[] {
    const links = issue.fields.issuelinks ?? [];
    return links
      .filter((link) => link.type?.inward?.toLowerCase().includes('blocked by') && link.inwardIssue)
      .map((link) => ({
        key: link.inwardIssue!.key,
        summary: link.inwardIssue!.fields?.summary ?? null,
        issueType: link.inwardIssue!.fields?.issuetype?.name ?? null,
      }));
  }

  /** Maps one Jira issue to the fields TaskRecord cares about. Returns null fields where Jira has no real equivalent (bugCount, pmRating) rather than guessing. */
  private mapIssueToTaskFields(issue: JiraIssue, storyPointsField: string) {
    const storyPoints = issue.fields[storyPointsField];
    const points = typeof storyPoints === 'number' && storyPoints > 0 ? Math.round(storyPoints) : DEFAULT_POINTS;

    const priorityName = issue.fields.priority?.name;
    const complexity = (priorityName && PRIORITY_TO_COMPLEXITY[priorityName]) || DEFAULT_COMPLEXITY;

    const originalEstimateSeconds = issue.fields.timetracking?.originalEstimateSeconds;
    const estimateHours = originalEstimateSeconds ? Math.round((originalEstimateSeconds / 3600) * 100) / 100 : DEFAULT_ESTIMATE_HOURS;

    const timeSpentSeconds = issue.fields.timetracking?.timeSpentSeconds;
    const actualHours = timeSpentSeconds ? Math.round((timeSpentSeconds / 3600) * 100) / 100 : null;

    const isDone = issue.fields.status?.statusCategory?.key === 'done';
    const completedAt = isDone && issue.fields.resolutiondate ? issue.fields.resolutiondate.slice(0, 10) : null;

    return {
      taskName: issue.fields.summary,
      projectName: issue.fields.project?.name ?? 'Unknown Jira Project',
      assigneeAccountId: issue.fields.assignee?.accountId ?? null,
      assigneeDisplayName: issue.fields.assignee?.displayName ?? 'Unassigned',
      estimateHours,
      actualHours,
      complexity,
      points,
      completedAt,
      createdAt: new Date(issue.fields.created),
      issueType: issue.fields.issuetype?.name ?? null,
      blockedByIssues: this.findBlockingIssues(issue),
    };
  }

  private emptySummary(status: JiraSyncStatus, errorMessage: string): JiraSyncSummary {
    return {
      status,
      issuesFetched: 0,
      tasksCreated: 0,
      tasksUpdated: 0,
      tasksSkipped: 0,
      errorMessage,
      unmatchedAssignees: [],
    };
  }

  private recordUnmatched(unmatched: Map<string, UnmatchedAssignee>, accountId: string, displayName: string): void {
    const entry = unmatched.get(accountId);
    if (entry) {
      entry.issueCount++;
    } else {
      unmatched.set(accountId, { accountId, displayName, issueCount: 1 });
    }
  }

  /** Upserts one issue into task_records, matched by jiraIssueKey — re-running a sync updates existing rows instead of duplicating. Returns 'skipped' for no-assignee or no-mapped-employee, recording the latter in `unmatched`. */
  private async syncOneIssue(
    issue: JiraIssue,
    storyPointsField: string,
    unmatched: Map<string, UnmatchedAssignee>,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const mapped = this.mapIssueToTaskFields(issue, storyPointsField);
    if (!mapped.assigneeAccountId) {
      return 'skipped';
    }

    const employee = await this.employeesService.findByJiraAccountId(mapped.assigneeAccountId);
    if (!employee) {
      this.recordUnmatched(unmatched, mapped.assigneeAccountId, mapped.assigneeDisplayName);
      return 'skipped';
    }

    const taskFields = {
      employeeId: employee.id,
      projectName: mapped.projectName,
      taskName: mapped.taskName,
      estimateHours: mapped.estimateHours,
      actualHours: mapped.actualHours,
      complexity: mapped.complexity,
      points: mapped.points,
      completedAt: mapped.completedAt,
      issueType: mapped.issueType,
      blockedByIssues: mapped.blockedByIssues,
    };

    const existing = await this.taskRepository.findOne({ where: { jiraIssueKey: issue.key } });
    if (existing) {
      await this.taskRepository.save(Object.assign(existing, taskFields));
      return 'updated';
    }

    const task = this.taskRepository.create({ ...taskFields, jiraIssueKey: issue.key, createdAt: mapped.createdAt });
    await this.taskRepository.save(task);
    return 'created';
  }

  /** Runs syncOneIssue for every fetched issue and tallies the outcomes — extracted purely to keep syncTasksFromJira's own complexity down. */
  private async syncAllIssues(issues: JiraIssue[], storyPointsField: string) {
    let tasksCreated = 0;
    let tasksUpdated = 0;
    let tasksSkipped = 0;
    const issueErrors: string[] = [];
    const unmatched = new Map<string, UnmatchedAssignee>();

    for (const issue of issues) {
      try {
        const outcome = await this.syncOneIssue(issue, storyPointsField, unmatched);
        if (outcome === 'created') {
          tasksCreated++;
        } else if (outcome === 'updated') {
          tasksUpdated++;
        } else {
          tasksSkipped++;
        }
      } catch (err) {
        tasksSkipped++;
        issueErrors.push(`${issue.key}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return { tasksCreated, tasksUpdated, tasksSkipped, issueErrors, unmatched };
  }

  /**
   * `syncAllProjects` re-fetches every project the account can see on each
   * run (so newly created Jira projects are picked up automatically) and
   * builds the JQL from that full list; the selective mode is pinned to the
   * project keys chosen on the Admin page. Either way the query still names
   * every project explicitly — Jira Cloud rejects a fully unbounded JQL
   * (e.g. bare "order by updated asc") with a 400, even with no date limit.
   * Returns null when there's nothing to sync — the caller turns that into
   * a SKIPPED summary rather than hitting Jira with an empty query.
   */
  private async buildSyncJql(connection: JiraConnection): Promise<string | null> {
    const projectKeys = connection.syncAllProjects
      ? (await this.fetchAllProjects(connection)).map((p) => p.key)
      : connection.projectKeys;
    if (projectKeys.length === 0) {
      return null;
    }
    const quotedKeys = projectKeys.map((key) => `"${key}"`).join(',');
    return `project in (${quotedKeys}) order by updated asc`;
  }

  /**
   * Pulls every issue in scope (all projects the account can see, or just
   * the Admin-selected ones — see buildSyncJql), upserts them into
   * task_records keyed by jiraIssueKey (existing jiraID -> update, new ->
   * create), and records the run in jira_sync_logs. Issues whose assignee
   * has no Employee.jiraAccountId mapped to them (or has no assignee at
   * all) are skipped, not guessed — see unmatchedAssignees on the result
   * for who still needs mapping. Manual only — there is no daily cron.
   */
  async syncTasksFromJira(): Promise<JiraSyncSummary> {
    const startedAt = new Date();

    const connection = await this.resolveConnection();
    if (!connection) {
      const summary = this.emptySummary(JiraSyncStatus.SKIPPED, 'Jira is not configured yet — set it up on the Admin page.');
      this.logger.warn(summary.errorMessage ?? '');
      await this.saveLog(startedAt, summary);
      return summary;
    }

    let jql: string | null;
    let issues: JiraIssue[] = [];
    try {
      jql = await this.buildSyncJql(connection);
      if (jql !== null) {
        issues = await this.fetchIssues(jql, connection);
      }
    } catch (err) {
      const summary = this.emptySummary(
        JiraSyncStatus.FAILED,
        err instanceof Error ? err.message : 'Unknown error fetching issues from Jira',
      );
      this.logger.error(`Jira sync failed: ${summary.errorMessage}`);
      await this.saveLog(startedAt, summary);
      return summary;
    }

    if (jql === null) {
      const summary = this.emptySummary(
        JiraSyncStatus.SKIPPED,
        connection.syncAllProjects
          ? 'Sync-all is on, but this Jira account has no projects to sync.'
          : 'No Jira projects selected — pick at least one project, or turn on "sync all projects", on the Admin page.',
      );
      this.logger.warn(summary.errorMessage ?? '');
      await this.saveLog(startedAt, summary);
      return summary;
    }

    const { tasksCreated, tasksUpdated, tasksSkipped, issueErrors, unmatched } = await this.syncAllIssues(
      issues,
      connection.storyPointsField,
    );

    const summary: JiraSyncSummary = {
      status: issueErrors.length === 0 ? JiraSyncStatus.SUCCESS : JiraSyncStatus.PARTIAL,
      issuesFetched: issues.length,
      tasksCreated,
      tasksUpdated,
      tasksSkipped,
      errorMessage: issueErrors.length > 0 ? issueErrors.slice(0, 20).join('; ') : null,
      unmatchedAssignees: Array.from(unmatched.values()),
    };
    this.logger.log(
      `Jira sync ${summary.status}: ${issues.length} fetched, ${tasksCreated} created, ${tasksUpdated} updated, ${tasksSkipped} skipped, ${summary.unmatchedAssignees.length} unmapped assignee(s)`,
    );
    await this.saveLog(startedAt, summary);
    return summary;
  }

  private emptyProjectSyncSummary(status: JiraSyncStatus, errorMessage: string): JiraProjectSyncSummary {
    return { status, projectsFetched: 0, projectsCreated: 0, projectsUpdated: 0, errorMessage };
  }

  /** Ensures a Project row exists for each fetched Jira project and tallies the outcomes — extracted purely to keep syncProjectsFromJira's own complexity down. */
  private async upsertAllProjects(projects: JiraProjectSummary[]) {
    let projectsCreated = 0;
    let projectsUpdated = 0;
    const errors: string[] = [];

    for (const project of projects) {
      try {
        const existing = await this.projectsService.findByName(project.name);
        await this.projectsService.upsertProject(project.name, {});
        if (existing) {
          projectsUpdated++;
        } else {
          projectsCreated++;
        }
      } catch (err) {
        errors.push(`${project.key}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return { projectsCreated, projectsUpdated, errors };
  }

  /**
   * Ensures a Project row exists (by name, matching the same free-text
   * matching TaskRecord.projectName already relies on) for every Jira
   * project in scope — the project analog of syncTasksFromJira above.
   * Existing projects are left alone (no field changes), only newly-seen
   * ones are created. Not logged to jira_sync_logs — that table's shape is
   * task-specific — the result is only shown inline on the Admin page.
   */
  async syncProjectsFromJira(): Promise<JiraProjectSyncSummary> {
    const connection = await this.resolveConnection();
    if (!connection) {
      return this.emptyProjectSyncSummary(JiraSyncStatus.SKIPPED, 'Jira is not configured yet — set it up on the Admin page.');
    }

    let projects: JiraProjectSummary[];
    try {
      projects = await this.resolveScopedProjects(connection);
    } catch (err) {
      return this.emptyProjectSyncSummary(
        JiraSyncStatus.FAILED,
        err instanceof Error ? err.message : 'Unknown error fetching projects from Jira',
      );
    }

    if (projects.length === 0) {
      return this.emptyProjectSyncSummary(
        JiraSyncStatus.SKIPPED,
        connection.syncAllProjects
          ? 'This Jira account has no projects.'
          : 'No Jira projects selected — pick at least one project, or turn on "sync all projects", on the Admin page.',
      );
    }

    const { projectsCreated, projectsUpdated, errors } = await this.upsertAllProjects(projects);

    const summary: JiraProjectSyncSummary = {
      status: errors.length === 0 ? JiraSyncStatus.SUCCESS : JiraSyncStatus.PARTIAL,
      projectsFetched: projects.length,
      projectsCreated,
      projectsUpdated,
      errorMessage: errors.length > 0 ? errors.slice(0, 20).join('; ') : null,
    };
    this.logger.log(
      `Jira project sync ${summary.status}: ${projects.length} fetched, ${projectsCreated} created, ${projectsUpdated} updated`,
    );
    return summary;
  }

  private async saveLog(startedAt: Date, summary: JiraSyncSummary): Promise<void> {
    const log = this.syncLogRepository.create({
      startedAt,
      finishedAt: new Date(),
      status: summary.status,
      issuesFetched: summary.issuesFetched,
      tasksCreated: summary.tasksCreated,
      tasksUpdated: summary.tasksUpdated,
      tasksSkipped: summary.tasksSkipped,
      errorMessage: summary.errorMessage,
      unmatchedAssignees: summary.unmatchedAssignees.length > 0 ? JSON.stringify(summary.unmatchedAssignees) : null,
    });
    await this.syncLogRepository.save(log);
  }

  findRecentLogs(limit = 30): Promise<JiraSyncLog[]> {
    return this.syncLogRepository.find({ order: { startedAt: 'DESC' }, take: limit });
  }
}
