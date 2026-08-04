import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import * as mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { TaskStatus } from '../common/enums/task-status.enum';
import { EmployeesService } from '../employees/employees.service';
import { ProjectsService } from '../projects/projects.service';
import { JiraService } from '../jira/jira.service';
import { GenerateBacklogDto } from './dto/generate-backlog.dto';

/** Parallels JiraService's "Unassigned (Jira)" placeholder — kept as a separate account so generated tasks stay distinguishable from Jira-synced ones when reassigning real owners later. */
const UNASSIGNED_GENERATED_EMAIL = 'unassigned-generated@devperf.internal';
const UNASSIGNED_GENERATED_NAME = 'Unassigned (Generated)';

export interface GeneratedTask {
  name: string;
  description?: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

export interface GeneratedStory {
  name: string;
  description?: string;
  tasks: GeneratedTask[];
}

export interface GeneratedEpic {
  name: string;
  description?: string;
  userStories: GeneratedStory[];
}

export interface GeneratedBacklog {
  epics: GeneratedEpic[];
}

type GeneratedIssueType = 'Epic' | 'Story' | 'Task';

/** One Epic/Story/Task's outcome when pushing an in-memory (not-yet-persisted-locally) generated backlog straight into Jira. */
export interface GeneratedBacklogPushRow {
  name: string;
  issueType: GeneratedIssueType;
  outcome: 'pushed' | 'already_exists' | 'failed' | 'skipped_parent_failed';
  jiraIssueKey: string | null;
  errorMessage: string | null;
  /** Optional fields Jira rejected for this project/screen and that were dropped so the create could still succeed — see JiraCreateIssueResult.droppedFields. */
  droppedFields?: string[];
}

export interface GeneratedBacklogPushSummary {
  jiraProjectKey: string;
  totalItems: number;
  pushed: number;
  failed: number;
  rows: GeneratedBacklogPushRow[];
}

export interface BacklogGeneratorResult {
  projectName: string;
  projectCreated: boolean;
  epicsCreated: number;
  storiesCreated: number;
  tasksCreated: number;
  totalPoints: number;
  totalEstimateHours: number;
  /** Markdown backlog doc — every line's Summary is `[taskCode] name`, per the [Epic-1]/[US-1.1]/[Task-1.1.1] convention already used for taskCode elsewhere in this system. */
  document: string;
}

export interface EpicMatch {
  generatedEpicName: string;
  matchedExistingKey: string | null;
  matchedExistingName: string | null;
  reason: string;
}

export interface StoryMatch {
  generatedStoryName: string;
  matchedExistingKey: string | null;
  matchedExistingName: string | null;
  reason: string;
}

export interface MatchSuggestionResult {
  epicMatches: EpicMatch[];
  storyMatches: StoryMatch[];
}

const TASK_SCHEMA_PROPERTIES = {
  name: { type: 'STRING', description: 'Short, actionable Task title — no numbering/prefix.' },
  description: { type: 'STRING', description: 'One sentence of implementation detail.' },
  points: { type: 'INTEGER', description: 'Agile story points for this task, 1-13.' },
  estimateHours: { type: 'NUMBER', description: 'Estimated hours of work, at least 1.' },
  complexity: { type: 'INTEGER', description: '1 (trivial) to 5 (highly complex).' },
};
const TASK_SCHEMA_REQUIRED = ['name', 'points', 'estimateHours', 'complexity'];

/** Document-import only: same Task shape, plus Acceptance Criteria — folded into the Task's description text after parsing (see buildTaskDescriptionWithAcceptanceCriteria), not kept as a separate field downstream. */
const DOCUMENT_TASK_SCHEMA_PROPERTIES = {
  ...TASK_SCHEMA_PROPERTIES,
  acceptanceCriteria: {
    type: 'ARRAY',
    items: { type: 'STRING' },
    description:
      "Concrete, testable Acceptance Criteria for this Task's User Story — use the document's own Acceptance Criteria for that Story if it states any, otherwise write 3-5 sensible ones based on the story.",
  },
};
const DOCUMENT_TASK_SCHEMA_REQUIRED = [...TASK_SCHEMA_REQUIRED, 'acceptanceCriteria'];

/** Gemini's structured-output schema is a subset of OpenAPI 3.0 — uppercase type names, no min/max keywords beyond what's listed here. */
const BACKLOG_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    epics: {
      type: 'ARRAY',
      description: 'Every Epic for this project, in a sensible delivery order.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Short Epic title, e.g. "Access management" — no numbering/prefix.' },
          description: { type: 'STRING', description: '1-2 sentence summary of what this Epic covers.' },
          userStories: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'Short User Story title, e.g. "Login system" — no numbering/prefix.' },
                description: { type: 'STRING', description: '1-2 sentence summary of this User Story.' },
                tasks: { type: 'ARRAY', items: { type: 'OBJECT', properties: TASK_SCHEMA_PROPERTIES, required: TASK_SCHEMA_REQUIRED } },
              },
              required: ['name', 'tasks'],
            },
          },
        },
        required: ['name', 'userStories'],
      },
    },
  },
  required: ['epics'],
};

/** Same shape as BACKLOG_RESPONSE_SCHEMA, but each User Story carries exactly one Task object (not an array) — the document-import flow's "one task per user story" rule is enforced structurally rather than by prompt instruction alone. */
const DOCUMENT_BACKLOG_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    epics: {
      type: 'ARRAY',
      description: 'Every Epic found in the document, in the order they appear.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Short Epic title, e.g. "Access management" — no numbering/prefix.' },
          description: { type: 'STRING', description: '1-2 sentence summary of what this Epic covers.' },
          userStories: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'Short User Story title, e.g. "Login system" — no numbering/prefix.' },
                description: { type: 'STRING', description: '1-2 sentence summary of this User Story, from the document.' },
                task: { type: 'OBJECT', properties: DOCUMENT_TASK_SCHEMA_PROPERTIES, required: DOCUMENT_TASK_SCHEMA_REQUIRED },
              },
              required: ['name', 'task'],
            },
          },
        },
        required: ['name', 'userStories'],
      },
    },
  },
  required: ['epics'],
};

const SYSTEM_PROMPT = `You are a senior technical project manager. Given a free-text project description, break it down into a complete Agile backlog: Epics, each containing User Stories, each containing concrete engineering Tasks.

Guidelines:
- Cover the whole description; don't leave out a major capability it mentions.
- Typically 3-8 Epics, 2-5 User Stories per Epic, 2-6 Tasks per Story — adjust to fit the description's actual scope, don't pad.
- Epic/Story/Task names are short titles only — never include numbering or bracketed codes like "[Epic-1]"; that is added separately.
- Tasks must be concrete and independently workable (e.g. "Build login form", not "Do login").
- Give every Task realistic points (Fibonacci-ish: 1,2,3,5,8,13), estimateHours, and complexity (1-5).
Respond with only the JSON object matching the given schema — no other text.`;

const DOCUMENT_SYSTEM_PROMPT = `You are a senior technical project manager. You are given the extracted text of a requirements document that already describes a project's Epics and User Stories (possibly under different headings, e.g. "Feature" or "Requirement").

Your job:
- Identify every Epic (a major capability area) and, under each, every User Story it describes.
- For each User Story, produce exactly ONE Task that implements it — the Task is that Story's single concrete deliverable, not a further breakdown into multiple sub-tasks.
- For that Task, also give its Acceptance Criteria: if the document states Acceptance Criteria (or "Definition of Done", "Given/When/Then", etc.) for that User Story, use those; otherwise write 3-5 concrete, testable criteria yourself based on the story.
- Epic/Story/Task names are short titles only — never include numbering or bracketed codes like "[Epic-1]"; that is added separately.
- Give the Task realistic points (Fibonacci-ish: 1,2,3,5,8,13), estimateHours, and complexity (1-5).
- If the document has no clear Epic groupings, group the User Stories you find into sensible Epics yourself.
Respond with only the JSON object matching the given schema — no other text.`;

/** Same Epic/User Story shape as the other schemas, but with no Task level at all — the "Generate from Description" flow's overview-only generation (project-level description in, Epics + User Stories out). */
const OVERVIEW_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    epics: {
      type: 'ARRAY',
      description: 'Every Epic (major capability area) for this project, in a sensible delivery order.',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Short Epic title, e.g. "Access management" — no numbering/prefix.' },
          description: { type: 'STRING', description: '1-2 sentence summary of what this Epic covers.' },
          userStories: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING', description: 'Short User Story title, e.g. "Login system" — no numbering/prefix.' },
                description: { type: 'STRING', description: '1-2 sentence summary of this User Story.' },
              },
              required: ['name'],
            },
          },
        },
        required: ['name', 'userStories'],
      },
    },
  },
  required: ['epics'],
};

const OVERVIEW_SYSTEM_PROMPT = `You are a senior technical project manager. Given a project description (extracted from a Jira issue, a Confluence page, or a PDF), produce a project OVERVIEW: every Epic (major capability area) and, under each, every User Story it should contain.

Guidelines:
- Cover the whole description; don't leave out a major capability it mentions.
- Typically 3-8 Epics, 2-6 User Stories per Epic — adjust to fit the description's actual scope, don't pad.
- This is an overview only — do NOT break User Stories down into Tasks.
- Epic/Story names are short titles only — never include numbering or bracketed codes like "[Epic-1]"; that is added separately.
Respond with only the JSON object matching the given schema — no other text.`;

const MATCH_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    epicMatches: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          generatedEpicName: { type: 'STRING' },
          matchedExistingKey: { type: 'STRING', nullable: true, description: 'Key of the existing Epic with the same meaning, or null if there is no confident match.' },
          matchedExistingName: { type: 'STRING', nullable: true },
          reason: { type: 'STRING', description: 'One sentence explaining the match, or why there is none.' },
        },
        required: ['generatedEpicName', 'reason'],
      },
    },
    storyMatches: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          generatedStoryName: { type: 'STRING' },
          matchedExistingKey: { type: 'STRING', nullable: true, description: 'Key of the existing User Story with the same meaning, or null if there is no confident match.' },
          matchedExistingName: { type: 'STRING', nullable: true },
          reason: { type: 'STRING', description: 'One sentence explaining the match, or why there is none.' },
        },
        required: ['generatedStoryName', 'reason'],
      },
    },
  },
  required: ['epicMatches', 'storyMatches'],
};

const MATCH_SYSTEM_PROMPT = `You compare a freshly-generated Agile backlog against a Jira project's EXISTING Epics and User Stories, to find items that describe the same underlying capability even when worded differently (e.g. "Audit Log List and Filtering" and "Audit trail search and filters" are the same capability).

For every generated Epic and every generated User Story given, decide whether one of the existing items listed represents the same underlying capability/story:
- If yes, return that existing item's exact key and name.
- If no confident match, return null for both key and name.
- Only match when you are genuinely confident they mean the same thing — sharing a topic area is not enough on its own.
- Always give a one-sentence reason, whether or not you found a match.
Respond with only the JSON object matching the given schema — no other text.`;

@Injectable()
export class BacklogGeneratorService {
  private readonly logger = new Logger(BacklogGeneratorService.name);

  constructor(
    @InjectRepository(TaskRecord)
    private readonly taskRepository: Repository<TaskRecord>,
    private readonly configService: ConfigService,
    private readonly employeesService: EmployeesService,
    private readonly projectsService: ProjectsService,
    private readonly jiraService: JiraService,
  ) {}

  async generate(dto: GenerateBacklogDto): Promise<BacklogGeneratorResult> {
    const { apiKey, model } = this.resolveGeminiConfig();
    const backlog = await this.callGemini(apiKey, model, SYSTEM_PROMPT, BACKLOG_RESPONSE_SCHEMA, dto.description);
    if (backlog.epics.length === 0) {
      throw new BadRequestException('The generated backlog came back empty — try a more detailed description.');
    }
    return this.persistBacklog(dto.projectName, backlog);
  }

  /**
   * Extracts a .docx's text and asks Gemini to identify its Epics/User
   * Stories (one Task per Story — see DOCUMENT_BACKLOG_RESPONSE_SCHEMA), but
   * does NOT save anything locally — this just returns the structure for
   * the Admin to review before deciding whether to push it to Jira via
   * pushGeneratedBacklogToJira.
   */
  async previewFromDocument(documentBuffer: Buffer): Promise<GeneratedBacklog> {
    const { apiKey, model } = this.resolveGeminiConfig();

    const { value: documentText } = await mammoth.extractRawText({ buffer: documentBuffer });
    if (documentText.trim().length < 20) {
      throw new BadRequestException('Could not extract readable text from this document — is it a valid .docx file?');
    }

    const backlog = await this.callGemini(apiKey, model, DOCUMENT_SYSTEM_PROMPT, DOCUMENT_BACKLOG_RESPONSE_SCHEMA, documentText, true);
    if (backlog.epics.length === 0) {
      throw new BadRequestException('Could not find any Epics/User Stories in this document — try a more detailed one.');
    }
    return backlog;
  }

  /**
   * Same pipeline as previewFromDocument(), but the "requirements document"
   * is a real Jira issue's own summary + description instead of an
   * uploaded .docx — fetched live via JiraService.fetchIssueContentByLink,
   * using the same connection/token every other Jira feature in this app
   * already uses. Nothing is saved locally, same as the document flow.
   */
  async previewFromJiraLink(jiraLink: string): Promise<GeneratedBacklog> {
    const { apiKey, model } = this.resolveGeminiConfig();

    const sourceText = await this.jiraService.fetchIssueContentByLink(jiraLink);
    if (sourceText.trim().length < 20) {
      throw new BadRequestException('Could not extract enough content from that Jira issue — does it have a description?');
    }

    const backlog = await this.callGemini(apiKey, model, DOCUMENT_SYSTEM_PROMPT, DOCUMENT_BACKLOG_RESPONSE_SCHEMA, sourceText, true);
    if (backlog.epics.length === 0) {
      throw new BadRequestException('Could not find any Epics/User Stories in that Jira issue — try a more detailed one.');
    }
    return backlog;
  }

  /**
   * The "Generate from Description" flow's overview generation: a project-level
   * description (fetched from a Jira issue or Confluence page, or extracted
   * from an uploaded PDF) becomes Epics and User Stories only — no Tasks.
   * Nothing is saved locally; review, then push to Jira via
   * pushGeneratedBacklogToJira (an empty tasks[] on every story there is a
   * no-op, so the same push path works unchanged for this Epic/Story-only case).
   */
  async previewOverviewFromJiraLink(jiraLink: string): Promise<GeneratedBacklog> {
    const { apiKey, model } = this.resolveGeminiConfig();
    const sourceText = await this.jiraService.fetchIssueContentByLink(jiraLink);
    if (sourceText.trim().length < 20) {
      throw new BadRequestException('Could not extract enough content from that link — does it have a description?');
    }
    return this.generateOverview(apiKey, model, sourceText, 'that link');
  }

  /** Same as previewOverviewFromJiraLink, but the source is an uploaded PDF's extracted text. */
  async previewOverviewFromPdf(pdfBuffer: Buffer): Promise<GeneratedBacklog> {
    const { apiKey, model } = this.resolveGeminiConfig();
    const { text } = await pdfParse(pdfBuffer);
    if (text.trim().length < 20) {
      throw new BadRequestException('Could not extract readable text from this PDF — is it a text-based (not scanned-image) PDF?');
    }
    return this.generateOverview(apiKey, model, text, 'this PDF');
  }

  private async generateOverview(apiKey: string, model: string, sourceText: string, sourceLabel: string): Promise<GeneratedBacklog> {
    const raw = await this.callGemini(apiKey, model, OVERVIEW_SYSTEM_PROMPT, OVERVIEW_RESPONSE_SCHEMA, sourceText);
    if (raw.epics.length === 0) {
      throw new BadRequestException(`Could not find any Epics/User Stories in ${sourceLabel} — try a more detailed one.`);
    }
    // The overview schema has no Task level at all, so Gemini's raw output has no `tasks` key on a
    // story — normalize to an explicit empty array so every downstream consumer of GeneratedBacklog
    // (persistBacklog, pushGeneratedBacklogToJira, the frontend) sees the shape it already expects.
    return {
      epics: raw.epics.map((epic) => ({
        name: epic.name,
        description: epic.description,
        userStories: (epic.userStories ?? []).map((story) => ({
          name: story.name,
          description: story.description,
          tasks: [],
        })),
      })),
    };
  }

  /**
   * Creates every Epic -> User Story -> Task in `backlog` directly in real
   * Jira, in order, so each child's Jira `parent` is already known by the
   * time it's created. Nothing is saved locally first — this is the
   * document-import flow's whole point (review, then push straight to
   * Jira, no local TaskRecord). A parent that fails to create causes its
   * children to be skipped rather than sent with a dangling reference.
   *
   * Epics and User Stories are looked up by name in the target Jira
   * project first (see JiraService.findExistingIssueKeyByName) — an
   * existing match is reused instead of creating a duplicate, so pushing
   * the same document (or an overlapping one) more than once doesn't pile
   * up repeat Epics/Stories. Tasks are always created fresh; they're the
   * actual work item this whole flow exists to add.
   */
  async pushGeneratedBacklogToJira(jiraProjectKey: string, backlog: GeneratedBacklog): Promise<GeneratedBacklogPushSummary> {
    const rows: GeneratedBacklogPushRow[] = [];

    for (const epic of backlog.epics) {
      const epicKey = await this.resolveOrCreateGeneratedIssue(jiraProjectKey, rows, epic.name, 'Epic');
      for (const story of epic.userStories ?? []) {
        await this.pushGeneratedStory(jiraProjectKey, rows, story, epicKey);
      }
    }

    const pushed = rows.filter((r) => r.outcome === 'pushed' || r.outcome === 'already_exists').length;
    const failed = rows.length - pushed;
    this.logger.log(`Pushed a generated (document-import) backlog to Jira project ${jiraProjectKey}: ${pushed} pushed, ${failed} failed`);

    return { jiraProjectKey, totalItems: rows.length, pushed, failed, rows };
  }

  /** One User Story and its (exactly one, by construction) Task — skipped without calling Jira when the Epic above it never got a key. */
  private async pushGeneratedStory(
    jiraProjectKey: string,
    rows: GeneratedBacklogPushRow[],
    story: GeneratedStory,
    epicKey: string | null,
  ): Promise<void> {
    if (!epicKey) {
      this.skipGeneratedIssue(rows, story.name, 'Story', 'Skipped — its Epic failed to push.');
      story.tasks.forEach((task) => this.skipGeneratedIssue(rows, task.name, 'Task', 'Skipped — its Epic failed to push.'));
      return;
    }

    const storyKey = await this.resolveOrCreateGeneratedIssue(jiraProjectKey, rows, story.name, 'Story', epicKey);
    for (const task of story.tasks) {
      if (!storyKey) {
        this.skipGeneratedIssue(rows, task.name, 'Task', 'Skipped — its User Story failed to push.');
        continue;
      }
      await this.pushOneGeneratedIssue(jiraProjectKey, rows, task.name, 'Task', storyKey, {
        description: task.description,
        storyPoints: task.points > 0 ? task.points : undefined,
      });
    }
  }

  /** Epic/Story only: reuses an existing Jira issue with this name in the project if one exists, otherwise creates it. */
  private async resolveOrCreateGeneratedIssue(
    jiraProjectKey: string,
    rows: GeneratedBacklogPushRow[],
    name: string,
    issueType: 'Epic' | 'Story',
    parentKey?: string,
  ): Promise<string | null> {
    const existingKey = await this.jiraService.findExistingIssueKeyByName(jiraProjectKey, issueType, name);
    if (existingKey) {
      rows.push({ name, issueType, outcome: 'already_exists', jiraIssueKey: existingKey, errorMessage: null });
      return existingKey;
    }
    return this.pushOneGeneratedIssue(jiraProjectKey, rows, name, issueType, parentKey);
  }

  /** Creates one issue in Jira and records its row; returns the new key (or null on failure) for the caller to use as the next level's parent. */
  private async pushOneGeneratedIssue(
    jiraProjectKey: string,
    rows: GeneratedBacklogPushRow[],
    name: string,
    issueType: GeneratedIssueType,
    parentKey?: string,
    extra: { description?: string; storyPoints?: number } = {},
  ): Promise<string | null> {
    const result = await this.jiraService.createIssue({ projectKey: jiraProjectKey, summary: name, issueType, parentKey, ...extra });
    rows.push({
      name,
      issueType,
      outcome: result.success ? 'pushed' : 'failed',
      jiraIssueKey: result.issueKey,
      errorMessage: result.errorMessage,
      ...(result.droppedFields ? { droppedFields: result.droppedFields } : {}),
    });
    return result.success ? result.issueKey : null;
  }

  /** Records a row for something never attempted because its parent failed, without calling Jira. */
  private skipGeneratedIssue(rows: GeneratedBacklogPushRow[], name: string, issueType: GeneratedIssueType, reason: string): void {
    rows.push({ name, issueType, outcome: 'skipped_parent_failed', jiraIssueKey: null, errorMessage: reason });
  }

  private resolveGeminiConfig(): { apiKey: string; model: string } {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('Set GEMINI_API_KEY in the backend .env to enable the Backlog Generator.');
    }
    const model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest';
    return { apiKey, model };
  }

  /** Shared by generate() and generateFromDocument(): saves every Epic/Story/Task as a real TaskRecord and builds the Markdown document. */
  private async persistBacklog(projectName: string, backlog: GeneratedBacklog): Promise<BacklogGeneratorResult> {
    const existingProject = await this.projectsService.findByName(projectName);
    const project = existingProject ?? (await this.projectsService.upsertProject(projectName, {}));
    const employeeId = await this.resolveUnassignedGeneratedPlaceholderEmployeeId();

    let epicsCreated = 0;
    let storiesCreated = 0;
    let tasksCreated = 0;
    let totalPoints = 0;
    let totalEstimateHours = 0;
    const docLines: string[] = [`# ${projectName} — Generated Backlog`, ''];

    // The frontend's Task Management tree nests children by matching a Story/Task's epicKey/storyKey against
    // its parent's own jiraIssueKey (the same field real Jira-synced data uses) — never against taskCode. These
    // rows have no real Jira issue, so each Epic/Story is given its own synthetic-but-unique jiraIssueKey here,
    // scoped by a per-run token so two separate generation calls never collide on the same value.
    const runToken = randomBytes(4).toString('hex');

    for (const [epicIndex, epic] of backlog.epics.entries()) {
      const epicCode = `Epic-${epicIndex + 1}`;
      const epicJiraKey = `GEN-${runToken}-${epicCode}`;
      await this.saveGeneratedRow({
        employeeId,
        projectName: project.name,
        taskName: this.truncateName(epic.name),
        taskCode: epicCode,
        jiraIssueKey: epicJiraKey,
        issueType: 'Epic',
        epicKey: null,
        storyKey: null,
      });
      epicsCreated += 1;
      docLines.push(`## [${epicCode}] ${epic.name}`);
      if (epic.description) {
        docLines.push('', epic.description);
      }
      docLines.push('');

      for (const [storyIndex, story] of (epic.userStories ?? []).entries()) {
        const storyCode = `US-${epicIndex + 1}.${storyIndex + 1}`;
        const storyJiraKey = `GEN-${runToken}-${storyCode}`;
        await this.saveGeneratedRow({
          employeeId,
          projectName: project.name,
          taskName: this.truncateName(story.name),
          taskCode: storyCode,
          jiraIssueKey: storyJiraKey,
          issueType: 'Story',
          epicKey: epicJiraKey,
          storyKey: null,
        });
        storiesCreated += 1;
        docLines.push(`### [${storyCode}] ${story.name}`);
        if (story.description) {
          docLines.push('', story.description);
        }
        docLines.push('');

        for (const [taskIndex, task] of (story.tasks ?? []).entries()) {
          const taskCode = `Task-${epicIndex + 1}.${storyIndex + 1}.${taskIndex + 1}`;
          const points = Math.max(1, Math.round(task.points));
          const estimateHours = Math.max(0.5, task.estimateHours);
          const complexity = Math.min(5, Math.max(1, Math.round(task.complexity)));
          await this.saveGeneratedRow({
            employeeId,
            projectName: project.name,
            taskName: this.truncateName(task.name),
            taskCode,
            jiraIssueKey: null,
            issueType: 'Task',
            epicKey: epicJiraKey,
            storyKey: storyJiraKey,
            points,
            estimateHours,
            complexity,
          });
          tasksCreated += 1;
          totalPoints += points;
          totalEstimateHours += estimateHours;
          docLines.push(
            `- [${taskCode}] ${task.name} (${points} pts, ${estimateHours}h)${task.description ? ` — ${task.description}` : ''}`,
          );
        }
        docLines.push('');
      }
    }

    this.logger.log(
      `Generated backlog for "${project.name}": ${epicsCreated} Epics, ${storiesCreated} Stories, ${tasksCreated} Tasks`,
    );

    return {
      projectName: project.name,
      projectCreated: !existingProject,
      epicsCreated,
      storiesCreated,
      tasksCreated,
      totalPoints,
      totalEstimateHours,
      document: docLines.join('\n'),
    };
  }

  private truncateName(name: string): string {
    return name.length > 200 ? name.slice(0, 200) : name;
  }

  private async saveGeneratedRow(fields: {
    employeeId: string;
    projectName: string;
    taskName: string;
    taskCode: string;
    jiraIssueKey: string | null;
    issueType: 'Epic' | 'Story' | 'Task';
    epicKey: string | null;
    storyKey: string | null;
    points?: number;
    estimateHours?: number;
    complexity?: number;
  }): Promise<TaskRecord> {
    const task = this.taskRepository.create({
      employeeId: fields.employeeId,
      projectName: fields.projectName,
      taskName: fields.taskName,
      taskCode: fields.taskCode,
      issueType: fields.issueType,
      epicKey: fields.epicKey,
      storyKey: fields.storyKey,
      points: fields.points ?? 0,
      estimateHours: fields.estimateHours ?? 0,
      complexity: fields.complexity ?? 1,
      status: TaskStatus.TODO,
      jiraIssueKey: fields.jiraIssueKey,
      blockedByTaskIds: [],
    });
    return this.taskRepository.save(task);
  }

  private async resolveUnassignedGeneratedPlaceholderEmployeeId(): Promise<string> {
    const existing = await this.employeesService.findByEmail(UNASSIGNED_GENERATED_EMAIL);
    if (existing) {
      return existing.id;
    }
    const joinDate = new Date().toISOString().slice(0, 10);
    const created = await this.employeesService.create({
      fullName: UNASSIGNED_GENERATED_NAME,
      email: UNASSIGNED_GENERATED_EMAIL,
      password: randomBytes(24).toString('hex'),
      role: 'developer',
      level: 'Junior',
      levelEffectiveDate: joinDate,
      joinDate,
    });
    return created.id;
  }

  /**
   * Calls Gemini's structured-output endpoint and returns a GeneratedBacklog.
   * When `singleTaskPerStory` is set (the document-import schema, where each
   * User Story carries one `task` object instead of a `tasks` array), each
   * story's singular task is wrapped into a one-element array so every
   * caller downstream (persistBacklog) sees the same GeneratedBacklog shape.
   */
  private async callGemini(
    apiKey: string,
    model: string,
    systemPrompt: string,
    responseSchema: unknown,
    sourceText: string,
    singleTaskPerStory = false,
  ): Promise<GeneratedBacklog> {
    const parsed = await this.callGeminiJson(apiKey, model, systemPrompt, responseSchema, sourceText);

    if (!singleTaskPerStory) {
      return parsed as GeneratedBacklog;
    }

    const documentShaped = parsed as {
      epics: Array<{
        name: string;
        description?: string;
        userStories: Array<{ name: string; description?: string; task: GeneratedTask & { acceptanceCriteria?: string[] } }>;
      }>;
    };
    return {
      epics: documentShaped.epics.map((epic) => ({
        name: epic.name,
        description: epic.description,
        userStories: (epic.userStories ?? []).map((story) => ({
          name: story.name,
          description: story.description,
          tasks: story.task
            ? [
                {
                  name: story.task.name,
                  points: story.task.points,
                  estimateHours: story.task.estimateHours,
                  complexity: story.task.complexity,
                  description: this.appendAcceptanceCriteria(story.task.description, story.task.acceptanceCriteria),
                },
              ]
            : [],
        })),
      })),
    };
  }

  /** Folds a Task's Acceptance Criteria into its description text as a bulleted block — the document-import flow's only place ACs live; nothing downstream (review, Jira push, editing) needs to know about them as a separate field. */
  private appendAcceptanceCriteria(description: string | undefined, acceptanceCriteria: string[] | undefined): string | undefined {
    const criteria = (acceptanceCriteria ?? []).map((c) => c.trim()).filter((c) => c.length > 0);
    if (criteria.length === 0) {
      return description;
    }
    const acBlock = ['Acceptance Criteria:', ...criteria.map((c) => `- ${c}`)].join('\n');
    return description ? `${description}\n\n${acBlock}` : acBlock;
  }

  /** The bare Gemini structured-output call, shared by callGemini() and suggestExistingMatches() — hits the API, unwraps the response, JSON.parses the text part. Callers cast the result to whatever shape their own responseSchema describes. */
  /** Gemini's free tier occasionally returns 503 ("currently experiencing high demand") or 429 (rate limit) — both are transient, safe to retry (this call has no side effects), so a couple of short backoff retries clear most of them without the user needing to manually click Generate again. */
  private static readonly GEMINI_RETRYABLE_STATUSES = new Set([429, 503]);
  private static readonly GEMINI_MAX_ATTEMPTS = 3;

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchGeminiResponse(apiKey: string, model: string, systemPrompt: string, responseSchema: unknown, sourceText: string): Promise<Response> {
    let lastResponse: Response | null = null;
    let lastBodyText = '';
    for (let attempt = 1; attempt <= BacklogGeneratorService.GEMINI_MAX_ATTEMPTS; attempt++) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: sourceText }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
        },
      );
      if (response.ok) {
        return response;
      }

      lastResponse = response;
      lastBodyText = await response.text();
      const isRetryable = BacklogGeneratorService.GEMINI_RETRYABLE_STATUSES.has(response.status);
      if (!isRetryable || attempt === BacklogGeneratorService.GEMINI_MAX_ATTEMPTS) {
        throw new BadRequestException(`Gemini API call failed (${response.status}): ${lastBodyText}`);
      }
      this.logger.warn(`Gemini API call failed (${response.status}), retrying (attempt ${attempt}/${BacklogGeneratorService.GEMINI_MAX_ATTEMPTS})...`);
      await this.delay(attempt * 1500);
    }
    // Unreachable — the loop above always either returns or throws — but keeps TypeScript satisfied.
    throw new BadRequestException(`Gemini API call failed (${lastResponse?.status}): ${lastBodyText}`);
  }

  private async callGeminiJson(apiKey: string, model: string, systemPrompt: string, responseSchema: unknown, sourceText: string): Promise<unknown> {
    const response = await this.fetchGeminiResponse(apiKey, model, systemPrompt, responseSchema, sourceText);

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new BadRequestException('Gemini did not return a structured response — try again.');
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new BadRequestException('Gemini returned malformed JSON — try again.');
    }
  }

  /**
   * Compares the freshly-generated Epics/User Stories against what already
   * exists in `jiraProjectKey`, so the Admin can map a generated one onto
   * an existing item instead of always creating something new — matching
   * on meaning, not just exact text, since "Audit Log List and Filtering"
   * and "Audit trail search and filters" describe the same capability with
   * different words. Read-only: no Jira write, nothing renamed here — the
   * caller decides what to do with the suggestions.
   */
  async suggestExistingMatches(jiraProjectKey: string, backlog: GeneratedBacklog): Promise<MatchSuggestionResult> {
    const { apiKey, model } = this.resolveGeminiConfig();
    const existing = await this.jiraService.listEpicsAndStories(jiraProjectKey);
    const existingEpics = existing.filter((e) => e.issueType === 'Epic');
    const existingStories = existing.filter((e) => e.issueType === 'Story');

    if (existingEpics.length === 0 && existingStories.length === 0) {
      return { epicMatches: [], storyMatches: [] };
    }

    const prompt = this.buildMatchPrompt(backlog, existingEpics, existingStories);
    const parsed = (await this.callGeminiJson(apiKey, model, MATCH_SYSTEM_PROMPT, MATCH_RESPONSE_SCHEMA, prompt)) as MatchSuggestionResult;
    return {
      epicMatches: parsed.epicMatches ?? [],
      storyMatches: parsed.storyMatches ?? [],
    };
  }

  private buildMatchPrompt(
    backlog: GeneratedBacklog,
    existingEpics: Array<{ key: string; name: string }>,
    existingStories: Array<{ key: string; name: string }>,
  ): string {
    const generatedEpicLines = backlog.epics.map((e, i) => `${i + 1}. ${e.name}${e.description ? ` — ${e.description}` : ''}`);
    const generatedStoryLines = backlog.epics.flatMap((epic) =>
      (epic.userStories ?? []).map((s, i) => `${i + 1}. ${s.name} (under Epic "${epic.name}")${s.description ? ` — ${s.description}` : ''}`),
    );
    const existingEpicLines = existingEpics.map((e) => `${e.key}: ${e.name}`);
    const existingStoryLines = existingStories.map((s) => `${s.key}: ${s.name}`);

    return [
      'GENERATED EPICS:',
      generatedEpicLines.join('\n') || '(none)',
      '',
      'GENERATED USER STORIES:',
      generatedStoryLines.join('\n') || '(none)',
      '',
      'EXISTING JIRA EPICS (key: name):',
      existingEpicLines.join('\n') || '(none)',
      '',
      'EXISTING JIRA USER STORIES (key: name):',
      existingStoryLines.join('\n') || '(none)',
    ].join('\n');
  }
}
