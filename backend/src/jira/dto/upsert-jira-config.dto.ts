import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUrl, MinLength } from 'class-validator';

export class UpsertJiraConfigDto {
  @IsUrl({ require_tld: true }, { message: 'baseUrl must be a valid URL, e.g. https://yourcompany.atlassian.net' })
  baseUrl: string;

  @IsEmail()
  email: string;

  /** Optional on update — omit (or send blank) to keep the currently-stored token unchanged. Required the first time. */
  @IsString()
  @MinLength(10)
  @IsOptional()
  apiToken?: string;

  /** Jira project keys picked from GET /jira-sync/projects. Ignored when syncAllProjects is true. Omit to leave the current selection untouched; send [] to clear it. */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  projectKeys?: string[];

  /** When true, every sync pulls every project the account can see, ignoring projectKeys. Omit to leave the current mode untouched. */
  @IsBoolean()
  @IsOptional()
  syncAllProjects?: boolean;

  @IsString()
  @IsOptional()
  storyPointsField?: string;
}
