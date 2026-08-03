import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { TaskStatus } from '../common/enums/task-status.enum';
import { EmployeesService } from '../employees/employees.service';
import { ProjectsService } from '../projects/projects.service';
import { GenerateBacklogDto } from './dto/generate-backlog.dto';

/** Parallels JiraService's "Unassigned (Jira)" placeholder — kept as a separate account so generated tasks stay distinguishable from Jira-synced ones when reassigning real owners later. */
const UNASSIGNED_GENERATED_EMAIL = 'unassigned-generated@devperf.internal';
const UNASSIGNED_GENERATED_NAME = 'Unassigned (Generated)';

interface GeneratedTask {
  name: string;
  description?: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

interface GeneratedStory {
  name: string;
  description?: string;
  tasks: GeneratedTask[];
}

interface GeneratedEpic {
  name: string;
  description?: string;
  userStories: GeneratedStory[];
}

interface GeneratedBacklog {
  epics: GeneratedEpic[];
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

/** Gemini's structured-output schema is a subset of OpenAPI 3.0 — uppercase type names, no min/max/description keywords beyond what's listed here. */
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
                tasks: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      name: { type: 'STRING', description: 'Short, actionable Task title — no numbering/prefix.' },
                      description: { type: 'STRING', description: 'One sentence of implementation detail.' },
                      points: { type: 'INTEGER', description: 'Agile story points for this task, 1-13.' },
                      estimateHours: { type: 'NUMBER', description: 'Estimated hours of work, at least 1.' },
                      complexity: { type: 'INTEGER', description: '1 (trivial) to 5 (highly complex).' },
                    },
                    required: ['name', 'points', 'estimateHours', 'complexity'],
                  },
                },
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

const SYSTEM_PROMPT = `You are a senior technical project manager. Given a free-text project description, break it down into a complete Agile backlog: Epics, each containing User Stories, each containing concrete engineering Tasks.

Guidelines:
- Cover the whole description; don't leave out a major capability it mentions.
- Typically 3-8 Epics, 2-5 User Stories per Epic, 2-6 Tasks per Story — adjust to fit the description's actual scope, don't pad.
- Epic/Story/Task names are short titles only — never include numbering or bracketed codes like "[Epic-1]"; that is added separately.
- Tasks must be concrete and independently workable (e.g. "Build login form", not "Do login").
- Give every Task realistic points (Fibonacci-ish: 1,2,3,5,8,13), estimateHours, and complexity (1-5).
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
  ) {}

  async generate(dto: GenerateBacklogDto): Promise<BacklogGeneratorResult> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new BadRequestException('Set GEMINI_API_KEY in the backend .env to enable the Backlog Generator.');
    }
    const model = this.configService.get<string>('GEMINI_MODEL') || 'gemini-flash-latest';

    const backlog = await this.callGemini(apiKey, model, dto.description);
    if (backlog.epics.length === 0) {
      throw new BadRequestException('The generated backlog came back empty — try a more detailed description.');
    }

    const existingProject = await this.projectsService.findByName(dto.projectName);
    const project = existingProject ?? (await this.projectsService.upsertProject(dto.projectName, {}));
    const employeeId = await this.resolveUnassignedGeneratedPlaceholderEmployeeId();

    let epicsCreated = 0;
    let storiesCreated = 0;
    let tasksCreated = 0;
    let totalPoints = 0;
    let totalEstimateHours = 0;
    const docLines: string[] = [`# ${dto.projectName} — Generated Backlog`, ''];

    // The frontend's Task Management tree nests children by matching a Story/Task's epicKey/storyKey against
    // its parent's own jiraIssueKey (the same field real Jira-synced data uses) — never against taskCode. These
    // rows have no real Jira issue, so each Epic/Story is given its own synthetic-but-unique jiraIssueKey here,
    // scoped by a per-run token so two separate generate() calls never collide on the same value.
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

  private async callGemini(apiKey: string, model: string, description: string): Promise<GeneratedBacklog> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: description }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: BACKLOG_RESPONSE_SCHEMA,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new BadRequestException(`Gemini API call failed (${response.status}): ${await response.text()}`);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new BadRequestException('Gemini did not return a structured backlog — try again.');
    }
    try {
      return JSON.parse(text) as GeneratedBacklog;
    } catch {
      throw new BadRequestException('Gemini returned malformed JSON — try again.');
    }
  }
}
