import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min, ValidateIf } from 'class-validator';
import { SkillTrack } from '../entities/employee-skill.entity';

export class DeclareEmployeeSkillDto {
  @IsUUID()
  skillId: string;

  @IsEnum(SkillTrack)
  track: SkillTrack;

  @IsInt()
  @Min(1)
  @Max(5)
  proficiency: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  targetProficiency?: number;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progressPercent?: number;

  /**
   * Career level for this skill, e.g. "Senior" at React — must match a
   * SkillLevel catalog entry's name. Required for CURRENT track.
   */
  @ValidateIf((dto: DeclareEmployeeSkillDto) => dto.track === SkillTrack.CURRENT)
  @IsString()
  level?: string;

  /** Start of the tracked study/usage period. */
  @IsDateString()
  startDate: string;

  /** Optional target/actual end date; can be left open-ended while ongoing. */
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
