import { IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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
}
