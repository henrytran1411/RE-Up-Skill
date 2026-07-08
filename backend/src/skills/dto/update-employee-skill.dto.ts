import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Editable fields on an existing skill-history entry. `skillId`/`track` are
 * intentionally excluded — changing what skill a historical entry refers to
 * doesn't make sense; delete and re-declare instead.
 */
export class UpdateEmployeeSkillDto {
  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  proficiency?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  targetProficiency?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  @IsString()
  @IsOptional()
  level?: string;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;
}
