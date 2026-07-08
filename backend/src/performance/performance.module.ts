import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceScoreRecord } from './entities/performance-score-record.entity';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { SkillsModule } from '../skills/skills.module';
import { ContributionModule } from '../contribution/contribution.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceScoreRecord]),
    SkillsModule,
    ContributionModule,
    CertificatesModule,
    EmployeesModule,
  ],
  controllers: [PerformanceController],
  providers: [PerformanceService],
})
export class PerformanceModule {}
