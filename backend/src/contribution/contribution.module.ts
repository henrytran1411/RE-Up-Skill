import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionRecord } from './entities/contribution-record.entity';
import { ContributionService } from './contribution.service';
import { ContributionController } from './contribution.controller';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([ContributionRecord]), EmployeesModule],
  controllers: [ContributionController],
  providers: [ContributionService],
  exports: [ContributionService],
})
export class ContributionModule {}
