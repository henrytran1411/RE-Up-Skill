import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceScoreRecord, PerformancePeriodHalf } from './entities/performance-score-record.entity';
import { SnapshotPerformancePeriodDto } from './dto/snapshot-performance-period.dto';
import { SnapshotAllPerformancePeriodDto } from './dto/snapshot-all-performance-period.dto';
import { SkillsService } from '../skills/skills.service';
import { ContributionService } from '../contribution/contribution.service';
import { CertificatesService } from '../certificates/certificates.service';
import { EmployeesService } from '../employees/employees.service';
import { currentPeriod, lastNHalfYearPeriods, periodBounds, round2 } from '../common/utils/period.util';

export interface PerformanceScorePeriod {
  employeeId: string;
  year: number;
  half: PerformancePeriodHalf;
  periodStart: string;
  periodEnd: string;
  technicalPoint: number;
  contributionPoints: number;
  certificatePoints: number;
  /** technicalPoint + contributionPoints + certificatePoints. */
  totalScore: number;
  /** True once this period has been snapshotted (frozen history); false for the live, still-changing current period. */
  isFinal: boolean;
}

interface LiveComputedScore {
  technicalPoint: number;
  contributionPoints: number;
  certificatePoints: number;
}

/** Contribution points on the Performance Score panel are 20% of the raw total shown on the Contribution panel. */
const CONTRIBUTION_WEIGHT = 0.2;

@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(PerformanceScoreRecord)
    private readonly recordRepository: Repository<PerformanceScoreRecord>,
    private readonly skillsService: SkillsService,
    @Inject(forwardRef(() => ContributionService))
    private readonly contributionService: ContributionService,
    private readonly certificatesService: CertificatesService,
    private readonly employeesService: EmployeesService,
  ) {}

  /**
   * Live values for one period, as of right now. Technical Point is always
   * "current standing"; contribution points are one-time events counted
   * only in the period they landed in. Certificate points are different:
   * once verified, a certificate keeps contributing its points to every
   * period it's still valid for — not just the period it was verified in —
   * and stops the first period that starts after it expires.
   */
  private async computeLiveScoreForPeriod(
    employeeId: string,
    year: number,
    half: PerformancePeriodHalf,
  ): Promise<LiveComputedScore> {
    const { periodStart, periodEnd } = periodBounds(year, half);
    const [technical, contributionRecords, certificates] = await Promise.all([
      this.skillsService.findTechnicalPointForEmployee(employeeId),
      this.contributionService.findForEmployee(employeeId),
      this.certificatesService.findForEmployee(employeeId),
    ]);

    const contributionPoints = round2(
      contributionRecords
        .filter((r) => r.recordDate >= periodStart && r.recordDate <= periodEnd)
        .reduce((sum, r) => sum + Number(r.points), 0) * CONTRIBUTION_WEIGHT,
    );
    const certificatePoints = round2(
      certificates
        .filter((c) => c.isVerified && c.verifiedAt)
        .filter((c) => {
          const verifiedDate = c.verifiedAt!.toISOString().slice(0, 10);
          // Valid for this period once verified by its end, and not yet expired before it starts.
          return verifiedDate <= periodEnd && c.expiredDate >= periodStart;
        })
        .reduce((sum, c) => sum + Number(c.points ?? 0), 0),
    );

    return { technicalPoint: round2(technical.totalPoints), contributionPoints, certificatePoints };
  }

  private toDto(record: PerformanceScoreRecord): PerformanceScorePeriod {
    const { periodStart, periodEnd } = periodBounds(record.year, record.half);
    return {
      employeeId: record.employeeId,
      year: record.year,
      half: record.half,
      periodStart,
      periodEnd,
      technicalPoint: Number(record.technicalPoint),
      contributionPoints: Number(record.contributionPoints),
      certificatePoints: Number(record.certificatePoints),
      totalScore: Number(record.totalScore),
      isFinal: true,
    };
  }

  private async buildLiveDto(
    employeeId: string,
    year: number,
    half: PerformancePeriodHalf,
  ): Promise<PerformanceScorePeriod> {
    const live = await this.computeLiveScoreForPeriod(employeeId, year, half);
    const { periodStart, periodEnd } = periodBounds(year, half);
    return {
      employeeId,
      year,
      half,
      periodStart,
      periodEnd,
      ...live,
      totalScore: round2(live.technicalPoint + live.contributionPoints + live.certificatePoints),
      isFinal: false,
    };
  }

  /**
   * Snapshotted (frozen) periods, oldest first, plus a live-computed preview
   * for the current period if it hasn't been snapshotted yet — so the chart
   * always shows something for "now" without that value silently drifting
   * once it's actually closed out.
   */
  async findPerformanceScoreHistoryForEmployee(employeeId: string): Promise<PerformanceScorePeriod[]> {
    const stored = await this.recordRepository.find({
      where: { employeeId },
      order: { year: 'ASC', half: 'ASC' },
    });

    const results = stored.map((r) => this.toDto(r));

    const { year: currentYear, half: currentHalf } = currentPeriod();
    const hasCurrentSnapshot = stored.some((r) => r.year === currentYear && r.half === currentHalf);
    if (!hasCurrentSnapshot) {
      results.push(await this.buildLiveDto(employeeId, currentYear, currentHalf));
    }

    return results.sort((a, b) => a.year - b.year || a.half.localeCompare(b.half));
  }

  /**
   * The `count` most recent half-year periods, each backed by its frozen
   * snapshot if one exists or a live-computed estimate otherwise — so the
   * employee's own dashboard always shows exactly `count` periods instead of
   * however many happen to have been snapshotted.
   */
  async findRecentPerformanceScoreHistoryForEmployee(
    employeeId: string,
    count = 4,
  ): Promise<PerformanceScorePeriod[]> {
    const periods = lastNHalfYearPeriods(count);
    const results: PerformanceScorePeriod[] = [];
    for (const { year, half } of periods) {
      const record = await this.recordRepository.findOne({ where: { employeeId, year, half } });
      results.push(record ? this.toDto(record) : await this.buildLiveDto(employeeId, year, half));
    }
    return results;
  }

  /**
   * Keeps an already-frozen period's contributionPoints (and totalScore) in
   * sync when a contribution_records entry lands inside its date range —
   * called by ContributionService after every create/update/remove. A no-op
   * for periods that were never snapshotted, since those are always
   * live-computed on read anyway.
   */
  async recalculateContributionPointsForPeriod(
    employeeId: string,
    year: number,
    half: PerformancePeriodHalf,
  ): Promise<void> {
    const record = await this.recordRepository.findOne({ where: { employeeId, year, half } });
    if (!record) {
      return;
    }

    const { periodStart, periodEnd } = periodBounds(year, half);
    const contributionRecords = await this.contributionService.findForEmployee(employeeId);
    const contributionPoints = round2(
      contributionRecords
        .filter((r) => r.recordDate >= periodStart && r.recordDate <= periodEnd)
        .reduce((sum, r) => sum + Number(r.points), 0) * CONTRIBUTION_WEIGHT,
    );

    record.contributionPoints = contributionPoints;
    record.totalScore = round2(Number(record.technicalPoint) + contributionPoints + Number(record.certificatePoints));
    await this.recordRepository.save(record);
  }

  /**
   * Inserts (or updates) the frozen snapshot for one employee's period.
   * Any of technicalPoint/contributionPoints/certificatePoints left unset
   * defaults to today's live-computed value — the normal case for closing
   * out the current period. Explicit overrides exist for backfilling a
   * historical period whose true value differed from today's standing.
   */
  async snapshotPeriodForEmployee(
    employeeId: string,
    dto: SnapshotPerformancePeriodDto,
  ): Promise<PerformanceScorePeriod> {
    const { year: defaultYear, half: defaultHalf } = currentPeriod();
    const year = dto.year ?? defaultYear;
    const half = dto.half ?? defaultHalf;

    const live = await this.computeLiveScoreForPeriod(employeeId, year, half);
    const technicalPoint = dto.technicalPoint ?? live.technicalPoint;
    const contributionPoints = dto.contributionPoints ?? live.contributionPoints;
    const certificatePoints = dto.certificatePoints ?? live.certificatePoints;
    const totalScore = round2(technicalPoint + contributionPoints + certificatePoints);

    let record = await this.recordRepository.findOne({ where: { employeeId, year, half } });
    if (!record) {
      record = this.recordRepository.create({ employeeId, year, half });
    }
    record.technicalPoint = technicalPoint;
    record.contributionPoints = contributionPoints;
    record.certificatePoints = certificatePoints;
    record.totalScore = totalScore;

    const saved = await this.recordRepository.save(record);
    return this.toDto(saved);
  }

  /** Snapshots the same period for every employee at once — always live-computed per employee, no overrides. */
  async snapshotPeriodForAllEmployees(dto: SnapshotAllPerformancePeriodDto): Promise<{ count: number }> {
    const employees = await this.employeesService.findAll();
    for (const employee of employees) {
      await this.snapshotPeriodForEmployee(employee.id, dto);
    }
    return { count: employees.length };
  }
}
