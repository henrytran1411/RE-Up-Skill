import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskRecord } from './entities/task-record.entity';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { ProjectHealthService } from './project-health.service';
import { EmployeesModule } from '../employees/employees.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaskRecord]), EmployeesModule, ProjectsModule],
  controllers: [TasksController],
  providers: [TasksService, ProjectHealthService],
  exports: [TasksService],
})
export class TasksModule {}
