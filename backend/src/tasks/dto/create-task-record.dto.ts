import { IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateTaskRecordDto {
  @IsUUID()
  employeeId: string;

  @IsString()
  projectName: string;

  @IsString()
  taskName: string;

  @IsNumber()
  estimateHours: number;

  @IsInt()
  @Min(1)
  @Max(5)
  complexity: number;

  /** Agile-style effort/story points, used to compute project effort share. */
  @IsInt()
  @Min(1)
  points: number;

  @IsOptional()
  @IsNumber()
  actualHours?: number;
}
