import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { TaskRecord, BlockedByIssueRef } from '../tasks/entities/task-record.entity';
import { TaskStatus } from '../common/enums/task-status.enum';
import { JiraSyncLog, JiraSyncStatus } from './entities/jira-sync-log.entity';
import { JiraConfig } from './entities/jira-config.entity';
import { UpsertJiraConfigDto } from './dto/upsert-jira-config.dto';
import { EmployeesService } from '../employees/employees.service';
import { ProjectsService } from '../projects/projects.service';
import { ProjectSprintsService } from '../projects/project-sprints.service';
import { TaskCodeService } from '../tasks/task-code.service';

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
    status?: { name?: string; statusCategory?: { key?: string } };
    timetracking?: { originalEstimateSeconds?: number; timeSpentSeconds?: number };
    issuetype?: { name?: string };
    issuelinks?: JiraIssueLink[];
    /** The issue this one is nested under in Jira's own issue hierarchy — a Story's parent is its Epic, a Task/Bug/Sub-task's parent is its Story (or directly its Epic, if the team skips the Story tier). */
    parent?: { key: string };
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

/** One entry from Jira's "Sprint" custom field (schema `gh-sprint`) — an issue can carry several if it was moved forward through more than one. */
interface JiraSprintRef {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

interface JiraFieldMeta {
  id: string;
  name?: string;
  schema?: { custom?: string };
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
  /** Set only by a single-project sync — how many TaskRecord rows got a fresh Epic-1/US-1.1/Task-1.1.1-style taskCode afterward. */
  taskCodesAssigned?: number;
  /** Set only by a single-project sync — employee accounts auto-created for previously-unmatched assignees, so their tasks could be synced in the same run. Each has the default temp password and a best-effort guessed email — review before handing out. */
  employeesCreated?: { fullName: string; email: string }[];
  /** Set only by a single-project sync — new ProjectSprint rows created from Jira's own Sprint field, appended after whatever sprints the project already had. */
  sprintsCreated?: number;
  /** Set only by a single-project sync — how many synced tasks got a projectSprintId from Jira's own Sprint field. */
  tasksAssignedToSprint?: number;
  /** Set only by a single-project sync — issues with no assignee in Jira at all, synced under the shared "Unassigned (Jira)" placeholder employee instead of being skipped. Reassign these to the real owner once known. */
  tasksWithoutAssignee?: number;
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

/**
 * Jira's status names are workflow-specific (a team can rename/add statuses
 * freely) — only "To Do", "In Progress", "Done"/"Completed" map directly to
 * our three-state TaskStatus; anything else (e.g. "In Review", "Blocked",
 * "QA") is treated as still in flight, i.e. IN_PROGRESS, rather than left
 * unset.
 */
function mapJiraStatusToTaskStatus(statusName: string | undefined | null): TaskStatus {
  switch (statusName?.trim().toLowerCase()) {
    case 'to do':
      return TaskStatus.TODO;
    case 'in progress':
      return TaskStatus.IN_PROGRESS;
    case 'done':
    case 'completed':
      return TaskStatus.COMPLETED;
    default:
      return TaskStatus.IN_PROGRESS;
  }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Used when an issue has no original estimate logged in Jira — a guess, not a derived fact. */
const DEFAULT_ESTIMATE_HOURS = 4;
const DEFAULT_POINTS = 1;
const DEFAULT_STORY_POINTS_FIELD = 'customfield_10016';

const MAX_RESULTS_PER_PAGE = 100;
const MAX_PROJECTS_PER_PAGE = 50;
const MAX_USERS_PER_PAGE = 50;

/** Same default the Admin page's "Quick Create" flow uses — meant to be handed to the person and changed, not kept. */
const DEFAULT_AUTO_CREATED_PASSWORD = 'Password123!';

/**
 * A single shared placeholder Employee used by syncSingleProjectFromJira to
 * hold tasks whose Jira issue has no assignee at all, instead of skipping
 * them — TaskRecord.employeeId is a required real FK, so there's no way to
 * store "no owner yet" without something to point at. A fake, never-logged-
 * into domain avoids colliding with any real person's guessed email; the
 * random password matches the self-provisioning convention used for
 * Microsoft-login accounts, since nobody is meant to sign in as this one.
 */
const UNASSIGNED_PLACEHOLDER_EMAIL = 'unassigned-jira@devperf.internal';
const UNASSIGNED_PLACEHOLDER_NAME = 'Unassigned (Jira)';

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
    private readonly projectSprintsService: ProjectSprintsService,
    private readonly taskCodeService: TaskCodeService,
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

  /**
   * Finds the custom field id backing Jira's own "Sprint" field (schema
   * `com.pyxis.greenhopper.jira:gh-sprint`) on this site — its numeric id
   * varies per Jira instance, the same way storyPointsField does, so this
   * discovers it rather than assuming a fixed id. Returns null (rather than
   * throwing) if the site has no such field — e.g. no Jira Software/Agile
   * boards enabled — so callers can just skip sprint sync gracefully.
   */
  private async resolveSprintFieldId(connection: JiraConnection): Promise<string | null> {
    try {
      const baseUrl = connection.baseUrl.replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/rest/api/3/field`, {
        headers: { Authorization: this.authHeader(connection), Accept: 'application/json' },
      });
      if (!response.ok) {
        this.logger.warn(`Could not list Jira fields to find the Sprint field (${response.status})`);
        return null;
      }
      const fields = (await response.json()) as JiraFieldMeta[];
      return fields.find((f) => f.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint')?.id ?? null;
    } catch (err) {
      this.logger.warn(`Could not resolve the Jira Sprint field: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /**
   * An issue can carry several sprints in this field — it's appended to
   * every time the issue moves to a new sprint without finishing the last
   * one. Picks the one with the latest startDate rather than trusting the
   * array's own order, since that's almost always the current/most
   * relevant sprint for this task regardless of how Jira ordered the list.
   */
  private pickCurrentSprint(rawValue: unknown): JiraSprintRef | null {
    if (!Array.isArray(rawValue) || rawValue.length === 0) {
      return null;
    }
    const sprints = rawValue as JiraSprintRef[];
    return sprints.reduce<JiraSprintRef | null>((latest, sprint) => {
      if (!latest) return sprint;
      return (sprint.startDate ?? '') > (latest.startDate ?? '') ? sprint : latest;
    }, null);
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

  /** Paginates through every matching issue for one JQL query via the cursor-based /search/jql endpoint. `sprintFieldId` is only passed by syncSingleProjectFromJira — omitted, the bulk sync's fields stay exactly as before. */
  private async fetchIssues(jql: string, connection: JiraConnection, sprintFieldId?: string | null): Promise<JiraIssue[]> {
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
      'parent',
      connection.storyPointsField,
      ...(sprintFieldId ? [sprintFieldId] : []),
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

  /**
   * key -> {issueType, parentKey} for every issue in the current sync batch —
   * built once up front so each issue can resolve its Epic/Story ancestry by
   * walking this local map instead of making extra Jira API calls. Only
   * covers issues fetched in this run; an issue whose parent lives outside
   * the synced scope (a different project, say) simply can't be resolved.
   */
  private buildHierarchyIndex(issues: JiraIssue[]): Map<string, { issueType: string | null; parentKey: string | null }> {
    return new Map(
      issues.map((issue) => [
        issue.key,
        { issueType: issue.fields.issuetype?.name ?? null, parentKey: issue.fields.parent?.key ?? null },
      ]),
    );
  }

  /**
   * Resolves `epicKey`/`storyKey` for one issue by walking `hierarchy`:
   * a Story's parent is its Epic; a Task/Bug/Sub-task's parent is its Story
   * (one more hop up to reach the Epic) or, if the team skips the Story
   * tier, directly its Epic. Returns both null wherever the chain can't be
   * followed (no parent, parent outside the synced batch, or an
   * unrecognized parent type like a Sub-task's parent Task) rather than
   * guessing.
   */
  private resolveEpicAndStoryKey(
    issueType: string | null,
    parentKey: string | null,
    hierarchy: Map<string, { issueType: string | null; parentKey: string | null }>,
  ): { epicKey: string | null; storyKey: string | null } {
    if (issueType === 'Epic' || !parentKey) {
      return { epicKey: null, storyKey: null };
    }

    const parent = hierarchy.get(parentKey);
    if (!parent || parent.issueType === 'Epic') {
      // Parent type unknown (outside the synced batch) or directly an Epic — either way there's no Story tier in between.
      return { epicKey: parentKey, storyKey: null };
    }
    if (parent.issueType === 'Story') {
      return { epicKey: parent.parentKey, storyKey: parentKey };
    }
    // Parent is something else (e.g. a Sub-task's parent Task) — not part of the Epic/Story/Task hierarchy we track.
    return { epicKey: null, storyKey: null };
  }

  /** Maps one Jira issue to the fields TaskRecord cares about. Returns null fields where Jira has no real equivalent (bugCount, pmRating) rather than guessing. `sprintFieldId` is only passed by syncSingleProjectFromJira. */
  private mapIssueToTaskFields(
    issue: JiraIssue,
    storyPointsField: string,
    hierarchy: Map<string, { issueType: string | null; parentKey: string | null }>,
    sprintFieldId?: string | null,
  ) {
    const issueType = issue.fields.issuetype?.name ?? null;
    // Per this team's convention, only Task-type issues carry their own points/estimate — Epic and Story roll theirs
    // up from their children instead, and Bug/Sub-task track only actual hours spent.
    const isTask = issueType === 'Task';

    const storyPoints = issue.fields[storyPointsField];
    let points = 0;
    if (isTask) {
      points = typeof storyPoints === 'number' && storyPoints > 0 ? Math.round(storyPoints) : DEFAULT_POINTS;
    }

    const priorityName = issue.fields.priority?.name;
    const complexity = (priorityName && PRIORITY_TO_COMPLEXITY[priorityName]) || DEFAULT_COMPLEXITY;

    const originalEstimateSeconds = issue.fields.timetracking?.originalEstimateSeconds;
    let estimateHours = 0;
    if (isTask) {
      estimateHours = originalEstimateSeconds ? Math.round((originalEstimateSeconds / 3600) * 100) / 100 : DEFAULT_ESTIMATE_HOURS;
    }

    const timeSpentSeconds = issue.fields.timetracking?.timeSpentSeconds;
    const actualHours = timeSpentSeconds ? Math.round((timeSpentSeconds / 3600) * 100) / 100 : null;

    const status = mapJiraStatusToTaskStatus(issue.fields.status?.name);
    const completedAt = status === TaskStatus.COMPLETED && issue.fields.resolutiondate ? issue.fields.resolutiondate.slice(0, 10) : null;

    const { epicKey, storyKey } = this.resolveEpicAndStoryKey(issueType, issue.fields.parent?.key ?? null, hierarchy);
    const jiraSprint = sprintFieldId ? this.pickCurrentSprint(issue.fields[sprintFieldId]) : null;

    return {
      taskName: issue.fields.summary,
      projectName: issue.fields.project?.name ?? 'Unknown Jira Project',
      assigneeAccountId: issue.fields.assignee?.accountId ?? null,
      assigneeDisplayName: issue.fields.assignee?.displayName ?? 'Unassigned',
      estimateHours,
      actualHours,
      complexity,
      points,
      status,
      completedAt,
      createdAt: new Date(issue.fields.created),
      issueType,
      blockedByIssues: this.findBlockingIssues(issue),
      epicKey,
      storyKey,
      jiraSprint,
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

  /** Jira display names here often carry an internal code prefix, e.g. "SMD172-My Pham" or "VT001 - Arthur Bonhomme" — mirrors the Admin page's own helper. */
  private stripCodePrefix(displayName: string): string {
    return displayName.replace(/^[A-Za-z]{2,}\d+\s*-\s*/, '').trim();
  }

  /**
   * Jira Cloud doesn't return other users' real email over the REST API
   * (privacy restriction) — this is a best-effort guess from the display
   * name and the connected account's own email domain, same heuristic the
   * Admin page's "Quick Create" flow uses. Not a fact — review before
   * treating it as real contact info.
   */
  private deriveCandidateEmail(displayName: string, domain: string): string {
    const asciiName = this.stripCodePrefix(displayName)
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
    const words = asciiName
      .replace(/[^a-z0-9\s]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length === 0) return '';
    const [firstWord, ...rest] = words;
    const localPart = rest.length > 0 ? `${firstWord}.${rest.join('')}` : firstWord;
    return `${localPart}@${domain}`;
  }

  /**
   * Auto-provisions an Employee account (Developer/Junior, the same default
   * temp password the Admin page's "Quick Create" button uses) for each
   * unmatched assignee that's an active, real Jira Cloud person (not a
   * bot/service account) — so a single-project sync can pick up their
   * tasks in the same run instead of needing a separate manual mapping
   * step. Guessed email collisions or any other create failure just skip
   * that one (it stays in unmatchedAssignees) rather than guessing harder.
   */
  private async autoCreateEmployeesForUnmatched(
    unmatchedAssignees: UnmatchedAssignee[],
    connection: JiraConnection,
  ): Promise<{ fullName: string; email: string }[]> {
    if (unmatchedAssignees.length === 0) {
      return [];
    }
    const domain = connection.email.split('@')[1];
    if (!domain) {
      return [];
    }

    let jiraUsers: JiraUserSummary[];
    try {
      jiraUsers = await this.listUsers();
    } catch (err) {
      this.logger.warn(`Could not verify Jira users for auto-create: ${err instanceof Error ? err.message : err}`);
      return [];
    }
    const jiraUserByAccountId = new Map(jiraUsers.map((u) => [u.accountId, u]));

    const created: { fullName: string; email: string }[] = [];
    const joinDate = new Date().toISOString().slice(0, 10);

    for (const assignee of unmatchedAssignees) {
      const jiraUser = jiraUserByAccountId.get(assignee.accountId);
      if (!jiraUser || !jiraUser.active || jiraUser.accountType !== 'atlassian') {
        continue; // bot/service account/inactive/unknown — don't guess an account into existence
      }
      const fullName = this.stripCodePrefix(assignee.displayName);
      const email = this.deriveCandidateEmail(assignee.displayName, domain);
      if (!fullName || !email) {
        continue;
      }
      try {
        await this.employeesService.create({
          fullName,
          email,
          password: DEFAULT_AUTO_CREATED_PASSWORD,
          role: 'developer',
          level: 'Junior',
          levelEffectiveDate: joinDate,
          joinDate,
          jiraAccountId: assignee.accountId,
        });
        created.push({ fullName, email });
      } catch (err) {
        this.logger.warn(
          `Auto-create skipped for "${assignee.displayName}" (${email}): ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return created;
  }

  /**
   * Finds (or creates, on first use) the shared placeholder Employee that
   * holds tasks synced from an assignee-less Jira issue — see
   * UNASSIGNED_PLACEHOLDER_EMAIL. Only called by syncSingleProjectFromJira.
   */
  private async resolveUnassignedPlaceholderEmployeeId(): Promise<string> {
    const existing = await this.employeesService.findByEmail(UNASSIGNED_PLACEHOLDER_EMAIL);
    if (existing) {
      return existing.id;
    }
    const joinDate = new Date().toISOString().slice(0, 10);
    const created = await this.employeesService.create({
      fullName: UNASSIGNED_PLACEHOLDER_NAME,
      email: UNASSIGNED_PLACEHOLDER_EMAIL,
      password: randomBytes(24).toString('hex'),
      role: 'developer',
      level: 'Junior',
      levelEffectiveDate: joinDate,
      joinDate,
    });
    return created.id;
  }

  /**
   * Upserts one issue into task_records, matched by jiraIssueKey —
   * re-running a sync updates existing rows instead of duplicating.
   *
   * An issue with an assignee Jira account that has no mapped Employee is
   * still skipped (recorded in `unmatched`) — that's a real person who
   * needs mapping, not guessed. An issue with NO assignee at all is only
   * skipped when `unassignedPlaceholderEmployeeId` is null (the bulk
   * sync's behavior); syncSingleProjectFromJira passes a real id instead,
   * so the task still syncs under the shared placeholder employee — see
   * resolveUnassignedPlaceholderEmployeeId — to be manually reassigned
   * later rather than lost. Note the unmatched-assignee case applies to
   * Epics and Stories too: one with no assignee in Jira won't sync, so the
   * Task Management hierarchy will have no parent row for its children to
   * nest under — assign Epics/Stories in Jira if you want them to anchor
   * the grouping.
   *
   * When `sprintFieldId` is given and the issue carries a Jira sprint (see
   * pickCurrentSprint), finds or creates the matching ProjectSprint via
   * ProjectSprintsService.findOrCreateFromJira and sets the task's
   * projectSprintId to it — but only for issues that actually sync
   * (skipped ones never get a sprint created for them). When the issue has
   * no sprint data, projectSprintId is left untouched on updates, so a
   * manually-assigned sprint doesn't get silently cleared.
   */
  private async syncOneIssue(
    issue: JiraIssue,
    storyPointsField: string,
    hierarchy: Map<string, { issueType: string | null; parentKey: string | null }>,
    unmatched: Map<string, UnmatchedAssignee>,
    sprintFieldId: string | null,
    unassignedPlaceholderEmployeeId: string | null,
  ): Promise<{
    outcome: 'created' | 'updated' | 'skipped';
    sprintCreated: boolean;
    sprintAssigned: boolean;
    usedPlaceholder: boolean;
  }> {
    const mapped = this.mapIssueToTaskFields(issue, storyPointsField, hierarchy, sprintFieldId);

    let employeeId: string;
    let usedPlaceholder = false;
    if (mapped.assigneeAccountId) {
      const employee = await this.employeesService.findByJiraAccountId(mapped.assigneeAccountId);
      if (!employee) {
        this.recordUnmatched(unmatched, mapped.assigneeAccountId, mapped.assigneeDisplayName);
        return { outcome: 'skipped', sprintCreated: false, sprintAssigned: false, usedPlaceholder: false };
      }
      employeeId = employee.id;
    } else if (unassignedPlaceholderEmployeeId) {
      employeeId = unassignedPlaceholderEmployeeId;
      usedPlaceholder = true;
    } else {
      return { outcome: 'skipped', sprintCreated: false, sprintAssigned: false, usedPlaceholder: false };
    }

    let sprintCreated = false;
    let projectSprintId: string | undefined;
    if (mapped.jiraSprint) {
      const { sprint, wasCreated } = await this.projectSprintsService.findOrCreateFromJira(
        mapped.projectName,
        mapped.jiraSprint,
      );
      projectSprintId = sprint.id;
      sprintCreated = wasCreated;
    }

    const existing = await this.taskRepository.findOne({ where: { jiraIssueKey: issue.key } });

    // Jira's own resolutiondate is the preferred completedAt, but a Done-category issue with none set (an
    // unconfigured resolution field, say) still needs a stamp to stay consistent with status — reuse whatever
    // was already stored rather than drifting to "today" on every re-sync.
    const completedAt =
      mapped.status === TaskStatus.COMPLETED ? mapped.completedAt ?? existing?.completedAt ?? todayIso() : null;

    const taskFields = {
      employeeId,
      projectName: mapped.projectName,
      taskName: mapped.taskName,
      estimateHours: mapped.estimateHours,
      actualHours: mapped.actualHours,
      complexity: mapped.complexity,
      points: mapped.points,
      status: mapped.status,
      completedAt,
      issueType: mapped.issueType,
      blockedByIssues: mapped.blockedByIssues,
      epicKey: mapped.epicKey,
      storyKey: mapped.storyKey,
      ...(projectSprintId !== undefined ? { projectSprintId } : {}),
    };

    if (existing) {
      await this.taskRepository.save(Object.assign(existing, taskFields));
      return { outcome: 'updated', sprintCreated, sprintAssigned: projectSprintId !== undefined, usedPlaceholder };
    }

    const task = this.taskRepository.create({ ...taskFields, jiraIssueKey: issue.key, createdAt: mapped.createdAt });
    await this.taskRepository.save(task);
    return { outcome: 'created', sprintCreated, sprintAssigned: projectSprintId !== undefined, usedPlaceholder };
  }

  /**
   * Runs syncOneIssue for every fetched issue and tallies the outcomes —
   * extracted purely to keep syncTasksFromJira's own complexity down. Builds
   * the Epic/Story hierarchy index once from the full batch up front, since
   * resolving any single issue's ancestry needs to see every other issue's
   * parent link, not just its own.
   */
  private async syncAllIssues(
    issues: JiraIssue[],
    storyPointsField: string,
    sprintFieldId: string | null = null,
    unassignedPlaceholderEmployeeId: string | null = null,
  ) {
    const hierarchy = this.buildHierarchyIndex(issues);
    let tasksCreated = 0;
    let tasksUpdated = 0;
    let tasksSkipped = 0;
    let sprintsCreated = 0;
    let tasksAssignedToSprint = 0;
    let tasksWithoutAssignee = 0;
    const issueErrors: string[] = [];
    const unmatched = new Map<string, UnmatchedAssignee>();

    for (const issue of issues) {
      try {
        const { outcome, sprintCreated, sprintAssigned, usedPlaceholder } = await this.syncOneIssue(
          issue,
          storyPointsField,
          hierarchy,
          unmatched,
          sprintFieldId,
          unassignedPlaceholderEmployeeId,
        );
        if (outcome === 'created') {
          tasksCreated++;
        } else if (outcome === 'updated') {
          tasksUpdated++;
        } else {
          tasksSkipped++;
        }
        if (sprintCreated) {
          sprintsCreated++;
        }
        if (sprintAssigned) {
          tasksAssignedToSprint++;
        }
        if (usedPlaceholder) {
          tasksWithoutAssignee++;
        }
      } catch (err) {
        tasksSkipped++;
        issueErrors.push(`${issue.key}: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    }

    return {
      tasksCreated,
      tasksUpdated,
      tasksSkipped,
      sprintsCreated,
      tasksAssignedToSprint,
      tasksWithoutAssignee,
      issueErrors,
      unmatched,
    };
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

    const { summary } = await this.fetchAndSyncIssues(issues, connection);
    this.logger.log(
      `Jira sync ${summary.status}: ${summary.issuesFetched} fetched, ${summary.tasksCreated} created, ${summary.tasksUpdated} updated, ${summary.tasksSkipped} skipped, ${summary.unmatchedAssignees.length} unmapped assignee(s)`,
    );
    await this.saveLog(startedAt, summary);
    return summary;
  }

  /** Shared by syncTasksFromJira and syncSingleProjectFromJira: upserts `issues` (already fetched) and builds the resulting summary, without logging/saving — callers do that themselves since their log messages differ. `sprintFieldId`/`unassignedPlaceholderEmployeeId` are only passed by syncSingleProjectFromJira. */
  private async fetchAndSyncIssues(
    issues: JiraIssue[],
    connection: JiraConnection,
    sprintFieldId: string | null = null,
    unassignedPlaceholderEmployeeId: string | null = null,
  ): Promise<{ summary: JiraSyncSummary }> {
    const {
      tasksCreated,
      tasksUpdated,
      tasksSkipped,
      sprintsCreated,
      tasksAssignedToSprint,
      tasksWithoutAssignee,
      issueErrors,
      unmatched,
    } = await this.syncAllIssues(issues, connection.storyPointsField, sprintFieldId, unassignedPlaceholderEmployeeId);
    const summary: JiraSyncSummary = {
      status: issueErrors.length === 0 ? JiraSyncStatus.SUCCESS : JiraSyncStatus.PARTIAL,
      issuesFetched: issues.length,
      tasksCreated,
      tasksUpdated,
      tasksSkipped,
      errorMessage: issueErrors.length > 0 ? issueErrors.slice(0, 20).join('; ') : null,
      unmatchedAssignees: Array.from(unmatched.values()),
      ...(sprintFieldId ? { sprintsCreated, tasksAssignedToSprint } : {}),
      ...(unassignedPlaceholderEmployeeId ? { tasksWithoutAssignee } : {}),
    };
    return { summary };
  }

  /**
   * Syncs exactly one Jira project by key — independent of the Admin page's
   * stored projectKeys/syncAllProjects selection, for a one-off "pull this
   * project now" action.
   *
   * If any issue's assignee has no Employee.jiraAccountId mapped, this
   * auto-creates a Developer/Junior account for each one that's an active,
   * real Jira Cloud person (skipping bots/service accounts and anyone the
   * guessed email collides with) — see autoCreateEmployeesForUnmatched —
   * then re-syncs the same already-fetched issues so their tasks land in
   * the same run instead of needing a separate manual mapping pass.
   *
   * If the project has Jira sprints defined and an issue is assigned into
   * one, this also finds-or-creates the matching ProjectSprint (see
   * ProjectSprintsService.findOrCreateFromJira) and assigns the task to
   * it — see pickCurrentSprint for how the "current" sprint is chosen when
   * an issue has moved through more than one.
   *
   * An issue with NO assignee at all in Jira still syncs — under the
   * shared "Unassigned (Jira)" placeholder employee (see
   * resolveUnassignedPlaceholderEmployeeId) — rather than being skipped,
   * so the task data isn't lost; reassign these to their real owner once
   * known. This differs from the unmatched-assignee case (a real Jira
   * person with no mapped Employee), which still needs mapping and isn't
   * synced until then.
   *
   * After that, recomputes every synced issue's `taskCode`
   * (Epic-1/US-1.1/Task-1.1.1/Bug-1.1.1.1/SubTask-1.1.1.1) via
   * TaskCodeService — see assignTaskCodesForProject for the numbering
   * rules. The project name used for that pass is read off the synced
   * issues themselves (Jira's own project.name), not the key.
   */
  async syncSingleProjectFromJira(projectKey: string): Promise<JiraSyncSummary> {
    const startedAt = new Date();

    const connection = await this.resolveConnection();
    if (!connection) {
      const summary = this.emptySummary(JiraSyncStatus.SKIPPED, 'Jira is not configured yet — set it up on the Admin page.');
      this.logger.warn(summary.errorMessage ?? '');
      await this.saveLog(startedAt, summary);
      return summary;
    }

    const sprintFieldId = await this.resolveSprintFieldId(connection);
    const unassignedPlaceholderEmployeeId = await this.resolveUnassignedPlaceholderEmployeeId();

    const jql = `project in ("${projectKey.replace(/"/g, '')}") order by updated asc`;
    let issues: JiraIssue[];
    try {
      issues = await this.fetchIssues(jql, connection, sprintFieldId);
    } catch (err) {
      const summary = this.emptySummary(
        JiraSyncStatus.FAILED,
        err instanceof Error ? err.message : 'Unknown error fetching issues from Jira',
      );
      this.logger.error(`Jira single-project sync failed: ${summary.errorMessage}`);
      await this.saveLog(startedAt, summary);
      return summary;
    }

    if (issues.length === 0) {
      const summary = this.emptySummary(
        JiraSyncStatus.SKIPPED,
        `No issues found for project "${projectKey}" — check the key, or that this Jira account can see it.`,
      );
      this.logger.warn(summary.errorMessage ?? '');
      await this.saveLog(startedAt, summary);
      return summary;
    }

    let { summary } = await this.fetchAndSyncIssues(issues, connection, sprintFieldId, unassignedPlaceholderEmployeeId);

    if (summary.unmatchedAssignees.length > 0) {
      const employeesCreated = await this.autoCreateEmployeesForUnmatched(summary.unmatchedAssignees, connection);
      if (employeesCreated.length > 0) {
        // Re-sync the same already-fetched issues now that these accounts exist, so their tasks are picked up in this same run.
        const resynced = await this.fetchAndSyncIssues(issues, connection, sprintFieldId, unassignedPlaceholderEmployeeId);
        summary = resynced.summary;
        summary.employeesCreated = employeesCreated;
      }
    }

    const projectName = issues[0].fields.project?.name;
    if (projectName && (summary.tasksCreated > 0 || summary.tasksUpdated > 0)) {
      summary.taskCodesAssigned = await this.taskCodeService.assignTaskCodesForProject(projectName);
    }

    this.logger.log(
      `Jira single-project sync (${projectKey}) ${summary.status}: ${summary.issuesFetched} fetched, ${summary.tasksCreated} created, ${summary.tasksUpdated} updated, ${summary.tasksSkipped} skipped (${summary.tasksWithoutAssignee ?? 0} unassigned, synced anyway), ${summary.employeesCreated?.length ?? 0} employee(s) auto-created, ${summary.sprintsCreated ?? 0} sprint(s) created, ${summary.tasksAssignedToSprint ?? 0} task(s) assigned to a sprint, ${summary.taskCodesAssigned ?? 0} task code(s) assigned`,
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
