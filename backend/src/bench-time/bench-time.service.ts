import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { BenchLog } from './entities/bench-log.entity';
import { EmployeeSkill, SkillTrack } from '../skills/entities/employee-skill.entity';
import { CreateBenchLogDto } from './dto/create-bench-log.dto';
import { ReviewBenchLogDto } from './dto/review-bench-log.dto';
import { EmployeesService } from '../employees/employees.service';
import { diffInDays, today } from '../common/utils/date.util';

const IDLE_BENCH_ALERT_DAYS = 14;

export interface IdleLearningAlert {
  employeeId: string;
  /** Start date of the most recent open bench-activity log — the reference point idleness is measured from. */
  lastActivityDate: string;
  daysIdle: number;
  thresholdDays: number;
}

@Injectable()
export class BenchTimeService {
  constructor(
    @InjectRepository(BenchLog)
    private readonly benchLogRepository: Repository<BenchLog>,
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
    private readonly employeesService: EmployeesService,
  ) {}

  create(employeeId: string, dto: CreateBenchLogDto): Promise<BenchLog> {
    const benchLog = this.benchLogRepository.create({
      employeeId,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
      activityType: dto.activityType,
      description: dto.description,
    });
    return this.benchLogRepository.save(benchLog);
  }

  findForEmployee(employeeId: string): Promise<BenchLog[]> {
    return this.benchLogRepository.find({
      where: { employeeId },
      order: { startDate: 'DESC' },
    });
  }

  async review(id: string, reviewerId: string, dto: ReviewBenchLogDto): Promise<BenchLog> {
    const benchLog = await this.benchLogRepository.findOne({ where: { id } });
    if (!benchLog) {
      throw new NotFoundException(`Bench log ${id} not found`);
    }

    benchLog.outcomeScore = dto.outcomeScore;
    benchLog.isReviewed = true;
    benchLog.reviewedById = reviewerId;
    return this.benchLogRepository.save(benchLog);
  }

  /**
   * Flags employees currently on bench (open-ended log, no endDate) whose most
   * recent activity was logged more than IDLE_BENCH_ALERT_DAYS ago — surfaced
   * on the PM dashboard as an "idle on bench" alert per CLAUDE.md section 5.3.
   */
  async findIdleBenchAlerts(): Promise<{ employeeId: string; lastActivityDate: string; daysIdle: number }[]> {
    const openLogs = await this.benchLogRepository.find({
      where: { endDate: IsNull() },
      order: { startDate: 'DESC' },
    });

    const latestByEmployee = new Map<string, BenchLog>();
    for (const log of openLogs) {
      const existing = latestByEmployee.get(log.employeeId);
      if (!existing || log.startDate > existing.startDate) {
        latestByEmployee.set(log.employeeId, log);
      }
    }

    const now = new Date();
    const alerts: { employeeId: string; lastActivityDate: string; daysIdle: number }[] = [];
    for (const [employeeId, log] of latestByEmployee) {
      const daysIdle = Math.floor(
        (now.getTime() - new Date(log.startDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysIdle >= IDLE_BENCH_ALERT_DAYS) {
        alerts.push({ employeeId, lastActivityDate: log.startDate, daysIdle });
      }
    }

    return alerts;
  }

  /**
   * Self-facing version of the idle-bench signal, extended with a learning
   * check: alerts this employee when they're currently on no project, their
   * most recent open bench-activity log started >= IDLE_BENCH_ALERT_DAYS ago,
   * AND they haven't declared a new LEARNING-track skill since then. Returns
   * null when there's nothing to warn about (on a project, not idle long
   * enough, no bench-log signal to measure from, or they're already learning
   * something).
   */
  async findIdleLearningAlertForEmployee(employeeId: string): Promise<IdleLearningAlert | null> {
    const employee = await this.employeesService.findOne(employeeId);
    if (employee.currentProject !== null) {
      return null;
    }

    const mostRecentOpenLog = await this.benchLogRepository.findOne({
      where: { employeeId, endDate: IsNull() },
      order: { startDate: 'DESC' },
    });
    if (!mostRecentOpenLog) {
      return null;
    }

    const lastActivityDate = mostRecentOpenLog.startDate;
    const daysIdle = diffInDays(lastActivityDate, today());
    if (daysIdle < IDLE_BENCH_ALERT_DAYS) {
      return null;
    }

    const startedLearningSince = await this.employeeSkillRepository.exists({
      where: {
        employeeId,
        track: SkillTrack.LEARNING,
        createdAt: MoreThanOrEqual(new Date(`${lastActivityDate}T00:00:00.000Z`)),
      },
    });
    if (startedLearningSince) {
      return null;
    }

    return { employeeId, lastActivityDate, daysIdle, thresholdDays: IDLE_BENCH_ALERT_DAYS };
  }

  async ensureOwnership(benchLogId: string, employeeId: string): Promise<void> {
    const benchLog = await this.benchLogRepository.findOne({ where: { id: benchLogId } });
    if (!benchLog) {
      throw new NotFoundException(`Bench log ${benchLogId} not found`);
    }
    if (benchLog.employeeId !== employeeId) {
      throw new ForbiddenException('You can only manage your own bench logs');
    }
  }
}
