import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { JiraSyncLog } from './entities/jira-sync-log.entity';
import { JiraConfig } from './entities/jira-config.entity';
import { JiraService } from './jira.service';
import { JiraController } from './jira.controller';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([TaskRecord, JiraSyncLog, JiraConfig]), EmployeesModule],
  controllers: [JiraController],
  providers: [JiraService],
  exports: [JiraService],
})
export class JiraModule {}
