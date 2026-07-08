import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { Role } from '../../common/enums/role.enum';
import { EmployeeStatus } from '../../common/enums/employee-status.enum';
import { EMPLOYEE_LEVEL_NAMES } from '../../common/enums/employee-level.enum';

export class FindEmployeesQueryDto {
  /** Matches against fullName or email, case-insensitive substring. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_LEVEL_NAMES)
  level?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  /** Derived work status, not a DB column — filtered in-memory after computing it. */
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
