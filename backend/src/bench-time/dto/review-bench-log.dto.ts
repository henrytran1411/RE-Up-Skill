import { IsInt, Max, Min } from 'class-validator';

export class ReviewBenchLogDto {
  @IsInt()
  @Min(1)
  @Max(5)
  outcomeScore: number;
}
