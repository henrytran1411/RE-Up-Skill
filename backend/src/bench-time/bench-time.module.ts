import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenchLog } from './entities/bench-log.entity';
import { EmployeeSkill } from '../skills/entities/employee-skill.entity';
import { BenchTimeService } from './bench-time.service';
import { BenchTimeController } from './bench-time.controller';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [TypeOrmModule.forFeature([BenchLog, EmployeeSkill]), EmployeesModule],
  controllers: [BenchTimeController],
  providers: [BenchTimeService],
  exports: [BenchTimeService],
})
export class BenchTimeModule {}
