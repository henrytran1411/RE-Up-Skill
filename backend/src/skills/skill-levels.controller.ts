import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { SkillLevelsService } from './skill-levels.service';
import { CreateSkillLevelDto } from './dto/create-skill-level.dto';
import { UpdateSkillLevelDto } from './dto/update-skill-level.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('skill-levels')
export class SkillLevelsController {
  constructor(private readonly skillLevelsService: SkillLevelsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  create(@Body() dto: CreateSkillLevelDto) {
    return this.skillLevelsService.create(dto);
  }

  @Get()
  findAll() {
    return this.skillLevelsService.findAll();
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  update(@Param('id') id: string, @Body() dto: UpdateSkillLevelDto) {
    return this.skillLevelsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  remove(@Param('id') id: string) {
    return this.skillLevelsService.remove(id);
  }
}
