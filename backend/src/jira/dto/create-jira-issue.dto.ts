import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export const JIRA_ISSUE_TYPES = ['Task', 'Bug', 'Story', 'Epic', 'Sub-task'] as const;

/** Creates a brand-new issue in real Jira — not a TaskRecord, an actual issue on the team's board. */
export class CreateJiraIssueDto {
  @IsString()
  projectKey: string;

  @IsString()
  summary: string;

  @IsIn(JIRA_ISSUE_TYPES)
  issueType: (typeof JIRA_ISSUE_TYPES)[number];

  /** The Jira account id (not email — Jira Cloud doesn't expose other users' email) to assign the new issue to. */
  @IsString()
  @IsOptional()
  assigneeAccountId?: string;

  /** The Epic/Story this issue nests under, by its Jira key (e.g. "ABC-12"). */
  @IsString()
  @IsOptional()
  parentKey?: string;

  /** Only meaningful for issueType Task — written to the connection's configured story-points field. */
  @IsInt()
  @Min(0)
  @IsOptional()
  storyPoints?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
