import { IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';
import { EMPLOYEE_LEVEL_NAMES } from '../../common/enums/employee-level.enum';

export class CreateEmployeeDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  /** Overall career level — capped at Senior, distinct from per-skill level. */
  @IsIn(EMPLOYEE_LEVEL_NAMES)
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
