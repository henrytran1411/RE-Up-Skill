import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class GeneratedTaskDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  points: number;

  @IsNumber()
  @Min(0)
  estimateHours: number;

  @IsInt()
  @Min(1)
  complexity: number;
}

export class GeneratedStoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneratedTaskDto)
  tasks: GeneratedTaskDto[];
}

export class GeneratedEpicDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneratedStoryDto)
  userStories: GeneratedStoryDto[];
}

/** The reviewed (possibly frontend-trimmed) result of previewFromDocument, plus which Jira project to create it all in. */
export class PushGeneratedBacklogDto {
  @IsString()
  jiraProjectKey: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeneratedEpicDto)
  epics: GeneratedEpicDto[];
}
