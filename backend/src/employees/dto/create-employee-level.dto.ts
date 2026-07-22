import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmployeeLevelDto {
  @IsString()
  @MaxLength(50)
  name: string;

  /** Display/ranking order — lower sorts first. Defaults to 0 if omitted. */
  @IsInt()
  @IsOptional()
  sortOrder?: number;
}
