import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { SkillCategory } from './entities/skill-category.entity';
import { SkillLevel } from './entities/skill-level.entity';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { SkillCategoriesService } from './skill-categories.service';
import { SkillCategoriesController } from './skill-categories.controller';
import { SkillLevelsService } from './skill-levels.service';
import { SkillLevelsController } from './skill-levels.controller';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([Skill, EmployeeSkill, SkillCategory, SkillLevel]), EmployeesModule],
  controllers: [SkillsController, SkillCategoriesController, SkillLevelsController],
  providers: [SkillsService, SkillCategoriesService, SkillLevelsService],
  exports: [SkillsService, SkillCategoriesService, SkillLevelsService],
})
export class SkillsModule {}
