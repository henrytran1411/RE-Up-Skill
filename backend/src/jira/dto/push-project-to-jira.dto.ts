import { IsString, MinLength } from 'class-validator';

export class PushProjectToJiraDto {
  /** The local system's Project.name whose tasks should be pushed. */
  @IsString()
  @MinLength(1)
  projectName: string;

  /** The target Jira project key every pushed issue is created in. */
  @IsString()
  @MinLength(1)
  jiraProjectKey: string;
}
