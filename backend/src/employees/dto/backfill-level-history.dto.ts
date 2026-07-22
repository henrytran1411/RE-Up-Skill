import { IsDateString, IsString } from 'class-validator';

/** Inserts a historical predecessor row before the employee's earliest existing level-history record. */
export class BackfillLevelHistoryDto {
  /** A name from the EmployeeLevel catalog (see /employee-levels). */
  @IsString()
  level: string;

  @IsDateString()
  startDate: string;
}
