import { IsDateString, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  /** A name from the EmployeeRole catalog (see /employee-roles). */
  @IsString()
  @IsOptional()
  role?: string;

  /** Overall career level — a name from the EmployeeLevel catalog (see /employee-levels), distinct from per-skill level. */
  @IsString()
  level: string;

  @IsDateString()
  levelEffectiveDate: string;

  @IsDateString()
  joinDate: string;

  @IsString()
  @IsOptional()
  currentProject?: string;

  /** Expected date this employee frees up from currentProject — for capacity planning. */
  @IsDateString()
  @IsOptional()
  availableFrom?: string;

  /** Jira Cloud accountId this employee maps to, for the daily Jira task sync — see JiraService. */
  @IsString()
  @IsOptional()
  jiraAccountId?: string;
}
