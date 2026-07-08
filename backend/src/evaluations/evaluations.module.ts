import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Evaluation } from './entities/evaluation.entity';
import { EvaluationsService } from './evaluations.service';
import { EvaluationsController } from './evaluations.controller';
import { EmployeesModule } from '../employees/employees.module';
import { TasksModule } from '../tasks/tasks.module';
import { SkillsModule } from '../skills/skills.module';
import { BenchTimeModule } from '../bench-time/bench-time.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Evaluation]),
    EmployeesModule,
    TasksModule,
    SkillsModule,
    BenchTimeModule,
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
