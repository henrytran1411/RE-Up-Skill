import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateBackupEpicTaskDto {
  /** Which of Epic-0's two draw-down stories this task belongs under — US-0.1 (Enhance) or US-0.2 (Change Request). */
  @IsIn(['ENHANCE', 'CHANGE_REQUEST'])
  category: 'ENHANCE' | 'CHANGE_REQUEST';

  @IsString()
  taskName: string;

  @IsInt()
  @Min(1)
  points: number;

  @IsNumber()
  @Min(0)
  estimateHours: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  complexity?: number;

  /** Defaults to the same "Unassigned (Generated)" placeholder every other generator-created row uses. */
  @IsUUID()
  @IsOptional()
  employeeId?: string;
}
