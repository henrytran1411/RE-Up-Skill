import { IsDateString, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CompleteTaskRecordDto {
  @IsNumber()
  actualHours: number;

  @IsDateString()
  completedAt: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  bugCount?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  pmRating?: number;
}
