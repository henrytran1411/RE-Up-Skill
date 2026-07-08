import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Evaluation } from './entities/evaluation.entity';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EmployeesService } from '../employees/employees.service';
import { TasksService } from '../tasks/tasks.service';
import { SkillsService } from '../skills/skills.service';
import { BenchTimeService } from '../bench-time/bench-time.service';
import { EvaluationStatus } from '../common/enums/evaluation-period.enum';
import { blendWeightProfiles } from './scoring/weight-profiles';
import {
  computeBenchScore,
  computeSkillScore,
  computeSoftSkillScore,
  computeTaskScore,
} from './scoring/scoring.util';

@Injectable()
export class EvaluationsService {
  constructor(
    @InjectRepository(Evaluation)
    private readonly evaluationRepository: Repository<Evaluation>,
    private readonly employeesService: EmployeesService,
    private readonly tasksService: TasksService,
    private readonly skillsService: SkillsService,
    private readonly benchTimeService: BenchTimeService,
  ) {}

  findForEmployee(employeeId: string): Promise<Evaluation[]> {
    return this.evaluationRepository.find({
      where: { employeeId },
      order: { periodStart: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Evaluation> {
    const evaluation = await this.evaluationRepository.findOne({ where: { id } });
    if (!evaluation) {
      throw new NotFoundException(`Evaluation ${id} not found`);
    }
    return evaluation;
  }

  /**
   * Runs the weighted scoring formula (CLAUDE.md section 4) for one employee
   * over one period and persists the result as a draft evaluation. If the
   * employee changed level mid-period, pass an explicit `levelBreakdown` in
   * the DTO to pro-rate the weight profile; otherwise the current level is
   * assumed to apply to the whole period.
   */
  async runEvaluation(dto: CreateEvaluationDto): Promise<Evaluation> {
    const employee = await this.employeesService.findOne(dto.employeeId);

    const levelBreakdown = dto.levelBreakdown ?? [{ level: employee.level, fraction: 1 }];
    const weightProfile = blendWeightProfiles(levelBreakdown);

    const [tasks, employeeSkills, benchLogs] = await Promise.all([
      this.tasksService.findForEmployeeInPeriod(dto.employeeId, dto.periodStart, dto.periodEnd),
      this.skillsService.findMatrixForEmployee(dto.employeeId),
      this.benchTimeService.findForEmployee(dto.employeeId),
    ]);

    const periodBenchLogs = benchLogs.filter(
      (log) => log.startDate >= dto.periodStart && log.startDate <= dto.periodEnd,
    );

    const taskScore = computeTaskScore(tasks);
    const skillScore = computeSkillScore(employeeSkills);
    const softSkillScore = computeSoftSkillScore(employeeSkills);
    const benchScore = computeBenchScore(periodBenchLogs);

    const totalScore =
      taskScore * weightProfile.taskWeight +
      skillScore * weightProfile.skillWeight +
      softSkillScore * weightProfile.softSkillWeight +
      benchScore * weightProfile.benchWeight;

    const evaluation = this.evaluationRepository.create({
      employeeId: dto.employeeId,
      period: dto.period,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
      levelBreakdown,
      taskScore,
      skillScore,
      softSkillScore,
      benchScore,
      totalScore,
      status: EvaluationStatus.DRAFT,
    });

    return this.evaluationRepository.save(evaluation);
  }

  async finalize(id: string, reviewerId: string, notes?: string): Promise<Evaluation> {
    const evaluation = await this.findOne(id);
    evaluation.status = EvaluationStatus.COMPLETED;
    evaluation.reviewerId = reviewerId;
    evaluation.notes = notes ?? evaluation.notes;
    return this.evaluationRepository.save(evaluation);
  }
}
