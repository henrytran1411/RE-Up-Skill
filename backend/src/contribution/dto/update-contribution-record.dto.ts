import { PartialType } from '@nestjs/swagger';
import { CreateContributionRecordDto } from './create-contribution-record.dto';

export class UpdateContributionRecordDto extends PartialType(CreateContributionRecordDto) {}
