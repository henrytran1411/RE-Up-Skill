import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { TaskStatus } from '../../common/enums/task-status.enum';

/** All fields optional — PM/Tech Lead/Admin can edit whichever fields need correcting. */
export class UpdateTaskRecordDto {
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  projectName?: string;

  @IsString()
  @IsOptional()
  taskName?: string;

  /** Hierarchy code shown in Task Management instead of the title — e.g. "Epic-1", "US-1.1", "Task-1.1.1", "SubTask-1.1.1.1". */
  @IsString()
  @IsOptional()
  taskCode?: string;

  @IsNumber()
  @IsOptional()
  estimateHours?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  complexity?: number;

  @IsInt()
  @Min(1)
  @IsOptional()
  points?: number;

  @IsNumber()
  @IsOptional()
  actualHours?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  bugCount?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  pmRating?: number;

  @IsDateString()
  @IsOptional()
  completedAt?: string;

  /** Which project sprint (see /projects/:name/sprints) this task is assigned to — set manually, not synced from Jira. */
  @IsUUID()
  @IsOptional()
  projectSprintId?: string;

  /** Other task ids (in this same project) that must finish before this one can — drives the task-level critical path. */
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  blockedByTaskIds?: string[];

  /** Workflow status. Setting COMPLETED without completedAt auto-stamps today; setting TODO/IN_PROGRESS clears completedAt. */
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;
}
