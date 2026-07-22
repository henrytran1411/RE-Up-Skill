import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { EmployeeStatus } from '../../common/enums/employee-status.enum';

export class FindEmployeesQueryDto {
  /** Matches against fullName or email, case-insensitive substring. */
  @IsOptional()
  @IsString()
  search?: string;

  /** A name from the EmployeeLevel catalog (see /employee-levels). */
  @IsOptional()
  @IsString()
  level?: string;

  /** A name from the EmployeeRole catalog (see /employee-roles). */
  @IsOptional()
  @IsString()
  role?: string;

  /** Derived work status, not a DB column — filtered in-memory after computing it. */
  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;
}
