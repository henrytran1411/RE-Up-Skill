import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { SkillCategoriesService } from './skill-categories.service';
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';
import { UpdateSkillCategoryDto } from './dto/update-skill-category.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('skill-categories')
export class SkillCategoriesController {
  constructor(private readonly skillCategoriesService: SkillCategoriesService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  create(@Body() dto: CreateSkillCategoryDto) {
    return this.skillCategoriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.skillCategoriesService.findAll();
  }

  /** Renames the category and cascades to every Skill referencing the old name. */
  @Patch(':id')
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  update(@Param('id') id: string, @Body() dto: UpdateSkillCategoryDto) {
    return this.skillCategoriesService.update(id, dto);
  }

  /** Blocked while any skill still references this category. */
  @Delete(':id')
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  remove(@Param('id') id: string) {
    return this.skillCategoriesService.remove(id);
  }
}
