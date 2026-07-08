import { IsInt, IsNumber, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class CreateSkillCategoryDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Score weight for an employee's primary skill in this category, e.g. 1.0. */
  @IsNumber()
  @Min(0)
  @IsOptional()
  primaryWeight?: number;

  /** Score weight for every other (non-primary) skill in this category, e.g. 0.2. */
  @IsNumber()
  @Min(0)
  @IsOptional()
  secondaryWeight?: number;

  /** How urgently employees with no skill here should be steered toward learning one — 1 (low) to 4 (highest). */
  @IsInt()
  @Min(1)
  @Max(4)
  @IsOptional()
  priority?: number;
}
