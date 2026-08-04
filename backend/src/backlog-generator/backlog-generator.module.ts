import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { EmployeesModule } from '../employees/employees.module';
import { ProjectsModule } from '../projects/projects.module';
import { JiraModule } from '../jira/jira.module';
import { BacklogGeneratorService } from './backlog-generator.service';
import { BacklogGeneratorController } from './backlog-generator.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TaskRecord]), EmployeesModule, ProjectsModule, JiraModule],
  controllers: [BacklogGeneratorController],
  providers: [BacklogGeneratorService],
})
export class BacklogGeneratorModule {}
