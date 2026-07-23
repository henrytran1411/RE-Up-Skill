import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity';
import { ProjectSprint } from './entities/project-sprint.entity';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { ProjectsService } from './projects.service';
import { ProjectSprintsService } from './project-sprints.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectSprint, TaskRecord])],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectSprintsService],
  exports: [ProjectsService, ProjectSprintsService],
})
export class ProjectsModule {}
