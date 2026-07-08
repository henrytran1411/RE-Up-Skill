import { IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { PerformancePeriodHalf } from '../entities/performance-score-record.entity';

/** Bulk snapshot — always live-computes every employee's own values, so no point overrides here. */
export class SnapshotAllPerformancePeriodDto {
  @IsInt()
  @Min(2000)
  @IsOptional()
  year?: number;

  @IsIn(Object.values(PerformancePeriodHalf))
  @IsOptional()
  half?: PerformancePeriodHalf;
}
