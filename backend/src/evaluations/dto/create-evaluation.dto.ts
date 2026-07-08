import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { EvaluationPeriod } from '../../common/enums/evaluation-period.enum';

export class LevelBreakdownEntryDto {
  /** Must match a SkillLevel catalog entry's name. */
  @IsString()
  level: string;

  /** Fraction of the evaluation period spent at this level, 0-1. All entries must sum to 1. */
  @IsNumber()
  fraction: number;
}

export class CreateEvaluationDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(EvaluationPeriod)
  period: EvaluationPeriod;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  /**
   * Optional explicit level breakdown for pro-rating when the employee
   * changed level mid-period. If omitted, the employee's current level is
   * assumed for the entire period.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LevelBreakdownEntryDto)
  levelBreakdown?: LevelBreakdownEntryDto[];
}
