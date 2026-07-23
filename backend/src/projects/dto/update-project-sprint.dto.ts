import { PartialType } from '@nestjs/swagger';
import { CreateProjectSprintDto } from './create-project-sprint.dto';

export class UpdateProjectSprintDto extends PartialType(CreateProjectSprintDto) {}
