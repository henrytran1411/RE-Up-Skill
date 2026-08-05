import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionRecord } from './entities/contribution-record.entity';
import { ContributionService } from './contribution.service';
import { ContributionController } from './contribution.controller';
import { EmployeesModule } from '../employees/employees.module';
import { PerformanceModule } from '../performance/performance.module';

@Module({
  imports: [TypeOrmModule.forFeature([ContributionRecord]), EmployeesModule, forwardRef(() => PerformanceModule)],
  controllers: [ContributionController],
  providers: [ContributionService],
  exports: [ContributionService],
})
export class ContributionModule {}
