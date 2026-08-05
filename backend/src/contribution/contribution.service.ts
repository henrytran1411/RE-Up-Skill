import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContributionRecord } from './entities/contribution-record.entity';
import { CreateContributionRecordDto } from './dto/create-contribution-record.dto';
import { UpdateContributionRecordDto } from './dto/update-contribution-record.dto';
import { ContributionSource } from '../common/enums/contribution-source.enum';
import { EmployeesService } from '../employees/employees.service';
import { PerformanceService } from '../performance/performance.service';
import { PerformancePeriodHalf } from '../performance/entities/performance-score-record.entity';
import { lastNHalfYearPeriods, periodBounds, periodFromDate, round2 } from '../common/utils/period.util';

export interface ContributionYearSummary {
  employeeId: string;
  year: number;
  totalPoints: number;
  bySource: Record<ContributionSource, number>;
  records: ContributionRecord[];
}

export interface ContributionHalfYearSummary {
  employeeId: string;
  year: number;
  half: PerformancePeriodHalf;
  periodStart: string;
  periodEnd: string;
  totalPoints: number;
  bySource: Record<ContributionSource, number>;
  records: ContributionRecord[];
}

const ZERO_BY_SOURCE = (): Record<ContributionSource, number> => ({
  [ContributionSource.PM_EVALUATION]: 0,
  [ContributionSource.SKILL_VERIFICATION]: 0,
  [ContributionSource.TASK_COMPLETION]: 0,
  [ContributionSource.COMPANY_CONTRIBUTION]: 0,
  [ContributionSource.COMPANY_REWARD]: 0,
});

@Injectable()
export class ContributionService {
  constructor(
    @InjectRepository(ContributionRecord)
    private readonly contributionRepository: Repository<ContributionRecord>,
    private readonly employeesService: EmployeesService,
    @Inject(forwardRef(() => PerformanceService))
    private readonly performanceService: PerformanceService,
  ) {}

  async findOne(id: string): Promise<ContributionRecord> {
    const record = await this.contributionRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Contribution record ${id} not found`);
    }
    return record;
  }

  /** Keeps an already-frozen performance_score_records period in sync after a contribution write lands in its range. */
  private async syncPerformancePeriod(employeeId: string, recordDate: string): Promise<void> {
    const { year, half } = periodFromDate(recordDate);
    await this.performanceService.recalculateContributionPointsForPeriod(employeeId, year, half);
  }

  /** Admin-only: logs one point entry against an employee's contribution ledger. */
  async create(dto: CreateContributionRecordDto, recordedById: string): Promise<ContributionRecord> {
    await this.employeesService.findOne(dto.employeeId);
    const record = this.contributionRepository.create({ ...dto, recordedById });
    const saved = await this.contributionRepository.save(record);
    await this.syncPerformancePeriod(saved.employeeId, saved.recordDate);
    return saved;
  }

  /** Admin-only: edits any field on an existing entry, including reassigning it to a different employee. */
  async update(id: string, dto: UpdateContributionRecordDto): Promise<ContributionRecord> {
    const record = await this.findOne(id);
    const previousEmployeeId = record.employeeId;
    const previousRecordDate = record.recordDate;
    if (dto.employeeId !== undefined) {
      await this.employeesService.findOne(dto.employeeId);
    }
    Object.assign(record, dto);
    const saved = await this.contributionRepository.save(record);
    await this.syncPerformancePeriod(previousEmployeeId, previousRecordDate);
    await this.syncPerformancePeriod(saved.employeeId, saved.recordDate);
    return saved;
  }

  /** Admin-only. */
  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    const { employeeId, recordDate } = record;
    await this.contributionRepository.remove(record);
    await this.syncPerformancePeriod(employeeId, recordDate);
  }

  /** Raw entries for one employee, most recent first — the admin management table and this employee's audit trail. */
  findForEmployee(employeeId: string): Promise<ContributionRecord[]> {
    return this.contributionRepository.find({
      where: { employeeId },
      order: { recordDate: 'DESC' },
    });
  }

  /** All entries, most recent first — the admin management table's default (unfiltered) view. */
  findAll(): Promise<ContributionRecord[]> {
    return this.contributionRepository.find({
      relations: ['employee'],
      order: { recordDate: 'DESC' },
    });
  }

  /**
   * One summary per calendar year the employee has entries in, oldest first,
   * each with a per-source point breakdown and the raw records for that year
   * (so the dashboard chart can drill into "what made up this year's total"
   * without a second round trip).
   */
  async findYearlySummaryForEmployee(employeeId: string): Promise<ContributionYearSummary[]> {
    const records = await this.findForEmployee(employeeId);

    const recordsByYear = new Map<number, ContributionRecord[]>();
    for (const record of records) {
      const year = Number(record.recordDate.slice(0, 4));
      const list = recordsByYear.get(year) ?? [];
      list.push(record);
      recordsByYear.set(year, list);
    }

    return Array.from(recordsByYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, yearRecords]) => {
        const bySource = ZERO_BY_SOURCE();
        for (const record of yearRecords) {
          bySource[record.source] = round2(bySource[record.source] + Number(record.points));
        }
        const totalPoints = round2(yearRecords.reduce((sum, r) => sum + Number(r.points), 0));
        return {
          employeeId,
          year,
          totalPoints,
          bySource,
          records: yearRecords.sort((a, b) => b.recordDate.localeCompare(a.recordDate)),
        };
      });
  }

  /**
   * The `count` most recent half-year periods, always present even with zero
   * records — mirrors PerformanceService's findRecentPerformanceScoreHistoryForEmployee
   * so both dashboard panels show the same periods (e.g. "2025 H1"..."2026 H2").
   */
  async findRecentHalfYearlySummaryForEmployee(
    employeeId: string,
    count = 4,
  ): Promise<ContributionHalfYearSummary[]> {
    const records = await this.findForEmployee(employeeId);
    const periods = lastNHalfYearPeriods(count);

    return periods.map(({ year, half }) => {
      const { periodStart, periodEnd } = periodBounds(year, half);
      const periodRecords = records.filter((r) => r.recordDate >= periodStart && r.recordDate <= periodEnd);

      const bySource = ZERO_BY_SOURCE();
      for (const record of periodRecords) {
        bySource[record.source] = round2(bySource[record.source] + Number(record.points));
      }
      const totalPoints = round2(periodRecords.reduce((sum, r) => sum + Number(r.points), 0));

      return {
        employeeId,
        year,
        half,
        periodStart,
        periodEnd,
        totalPoints,
        bySource,
        records: periodRecords.sort((a, b) => b.recordDate.localeCompare(a.recordDate)),
      };
    });
  }
}
