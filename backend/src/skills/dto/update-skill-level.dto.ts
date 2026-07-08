import { PartialType } from '@nestjs/swagger';
import { CreateSkillLevelDto } from './create-skill-level.dto';

export class UpdateSkillLevelDto extends PartialType(CreateSkillLevelDto) {}
