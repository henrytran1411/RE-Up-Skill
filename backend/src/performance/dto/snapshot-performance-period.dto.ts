import { IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';
import { PerformancePeriodHalf } from '../entities/performance-score-record.entity';

/** All fields optional: year/half default to the current period; point fields default to live-computed values. */
export class SnapshotPerformancePeriodDto {
  @IsInt()
  @Min(2000)
  @IsOptional()
  year?: number;

  @IsIn(Object.values(PerformancePeriodHalf))
  @IsOptional()
  half?: PerformancePeriodHalf;

  /** Override for Technical Point — use when backfilling a historical period whose true value differs from today's live standing. */
  @IsNumber()
  @IsOptional()
  technicalPoint?: number;

  @IsNumber()
  @IsOptional()
  contributionPoints?: number;

  @IsNumber()
  @IsOptional()
  certificatePoints?: number;
}
