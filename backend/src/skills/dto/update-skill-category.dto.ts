import { PartialType } from '@nestjs/swagger';
import { CreateSkillCategoryDto } from './create-skill-category.dto';

/** `name` here renames the category and cascades to every Skill row referencing the old name. */
export class UpdateSkillCategoryDto extends PartialType(CreateSkillCategoryDto) {}
