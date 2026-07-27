import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { ProjectBoardType } from '../../common/enums/project-board-type.enum';

export class CreateProjectDto {
  @IsString()
  @MaxLength(150)
  name: string;

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

  /** Kanban vs. Agile — defaults to AGILE (Sprint tab shown) when omitted. */
  @IsEnum(ProjectBoardType)
  @IsOptional()
  projectBoardType?: ProjectBoardType;
}
