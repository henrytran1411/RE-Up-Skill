import { IsNumber, Min } from 'class-validator';

/** Salary is set only through the dedicated salary endpoint, invoked from the ROI screen — not via the general employee edit form. */
export class SetSalaryDto {
  @IsNumber()
  @Min(0)
  monthlySalary: number;
}
