import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TaskStatus } from '../../common/enums/task-status.enum';

export class CreateTaskRecordDto {
  @IsUUID()
  employeeId: string;

  @IsString()
  projectName: string;

  @IsString()
  taskName: string;

  /** Free-text detail — also where a synced Jira issue's own description will land once Jira sync is extended to write it. */
  @IsString()
  @IsOptional()
  description?: string;

  /** Hierarchy code shown in Task Management instead of the title — e.g. "Epic-1", "US-1.1", "Task-1.1.1", "SubTask-1.1.1.1". */
  @IsString()
  @IsOptional()
  taskCode?: string;

  @IsNumber()
  estimateHours: number;

  @IsInt()
  @Min(1)
  @Max(5)
  complexity: number;

  /**
   * Agile-style effort/story points, used to compute project effort share.
   * Stays @Min(1) here (unlike UpdateTaskRecordDto, which allows 0) since
   * this DTO has no issueType field — every manually-created task is a
   * plain leaf, never an Epic/Story/Task-with-Sub-tasks rollup container,
   * so it should always carry a real, positive estimate.
   */
  @IsInt()
  @Min(1)
  points: number;

  @IsOptional()
  @IsNumber()
  actualHours?: number;

  /** Which project sprint (see /projects/:name/sprints) this task is assigned to — set manually, not synced from Jira. */
  @IsUUID()
  @IsOptional()
  projectSprintId?: string;

  /** Other task ids (in this same project) that must finish before this one can — drives the task-level critical path. */
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  blockedByTaskIds?: string[];

  /** Workflow status — defaults to To Do. Setting COMPLETED without completedAt auto-stamps today. */
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;
}
