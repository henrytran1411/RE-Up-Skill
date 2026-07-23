import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectSprint } from './entities/project-sprint.entity';
import { ProjectContribution } from './entities/project-contribution.entity';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { ProjectsService } from './projects.service';
import { ProjectSprintsService } from './project-sprints.service';
import { ProjectContributionsService } from './project-contributions.service';
import { ProjectsController } from './projects.controller';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectSprint, ProjectContribution, TaskRecord]), EmployeesModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectSprintsService, ProjectContributionsService],
  exports: [ProjectsService, ProjectSprintsService, ProjectContributionsService],
})
export class ProjectsModule {}
