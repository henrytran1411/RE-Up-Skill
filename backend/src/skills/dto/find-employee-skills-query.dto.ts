import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { SkillTrack } from '../entities/employee-skill.entity';
import { SkillStatus } from '../../common/enums/skill-status.enum';

export class FindEmployeeSkillsQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsUUID()
  skillId?: string;

  @IsOptional()
  @IsEnum(SkillTrack)
  track?: SkillTrack;

  @IsOptional()
  @IsEnum(SkillStatus)
  status?: SkillStatus;

  @IsOptional()
  @IsString()
  level?: string;

  /** Matches against the skill's name, case-insensitive substring. */
  @IsOptional()
  @IsString()
  search?: string;
}
