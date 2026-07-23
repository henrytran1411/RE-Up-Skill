import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateProjectSprintDto {
  @IsInt()
  @Min(1)
  @Max(999)
  sprintNumber: number;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  name?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
