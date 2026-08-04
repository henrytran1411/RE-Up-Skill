import { IsString, MinLength } from 'class-validator';

export class PreviewFromJiraLinkDto {
  /** Any Jira issue URL shape (browse, board-with-selectedIssue, /issues/), or a bare issue key like "ABC-123". */
  @IsString()
  @MinLength(1)
  jiraLink: string;
}
