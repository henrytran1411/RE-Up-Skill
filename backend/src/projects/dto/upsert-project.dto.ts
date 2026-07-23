import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** All fields optional: HR/Admin can set revenue and/or assign a manager independently, or rename the project. */
export class UpsertProjectDto {
  /** Renames the project — cascades to every task record's projectName. */
  @IsString()
  @MaxLength(150)
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  revenue?: number;

  /** The employee (PM) responsible for this project — scopes their view on the Projects page. */
  @IsUUID()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** Kickoff date — anchors the Sprint tab's quick-create-sprints generator. */
  @IsDateString()
  @IsOptional()
  startDate?: string;

  /** Target completion date — compared against the health check's computed critical-path finish. */
  @IsDateString()
  @IsOptional()
  targetEndDate?: string;
}
