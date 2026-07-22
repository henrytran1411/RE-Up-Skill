import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeLevelDto } from './create-employee-level.dto';

export class UpdateEmployeeLevelDto extends PartialType(CreateEmployeeLevelDto) {}
