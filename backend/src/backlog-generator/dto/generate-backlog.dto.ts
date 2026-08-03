import { IsString, MinLength } from 'class-validator';

export class GenerateBacklogDto {
  @IsString()
  @MinLength(1)
  projectName: string;

  @IsString()
  @MinLength(20)
  description: string;
}
