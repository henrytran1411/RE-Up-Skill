import { IsDateString, IsIn } from 'class-validator';
import { EMPLOYEE_LEVEL_NAMES } from '../../common/enums/employee-level.enum';

/** Inserts a historical predecessor row before the employee's earliest existing level-history record. */
export class BackfillLevelHistoryDto {
  @IsIn(EMPLOYEE_LEVEL_NAMES)
  level: string;

  @IsDateString()
  startDate: string;
}
