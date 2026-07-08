import { IsDateString, IsEnum, IsNumber, IsString, IsUUID } from 'class-validator';
import { ContributionSource } from '../../common/enums/contribution-source.enum';

export class CreateContributionRecordDto {
  @IsUUID()
  employeeId: string;

  @IsEnum(ContributionSource)
  source: ContributionSource;

  @IsNumber()
  points: number;

  @IsDateString()
  recordDate: string;

  @IsString()
  description: string;
}
