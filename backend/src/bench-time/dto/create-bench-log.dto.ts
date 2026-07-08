import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { BenchActivityType } from '../../common/enums/bench-activity-type.enum';

export class CreateBenchLogDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(BenchActivityType)
  activityType: BenchActivityType;

  @IsString()
  description: string;
}
