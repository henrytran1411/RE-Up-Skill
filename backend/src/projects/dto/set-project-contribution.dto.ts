import { IsNumber, Min } from 'class-validator';

/** A contribution rate is set only through the dedicated endpoint, invoked from the ROI screen — not via the general employee edit form. */
export class SetProjectContributionDto {
  @IsNumber()
  @Min(0)
  totalSalary: number;
}
