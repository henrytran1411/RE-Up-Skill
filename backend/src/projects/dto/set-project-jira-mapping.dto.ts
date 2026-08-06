import { IsString, MinLength } from 'class-validator';

export class SetProjectJiraMappingDto {
  @IsString()
  @MinLength(1)
  jiraProjectKey: string;
}
