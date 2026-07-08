import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PerformanceScoreRecord, PerformancePeriodHalf } from './entities/performance-score-record.entity';
import { SnapshotPerformancePeriodDto } from './dto/snapshot-performance-period.dto';
import { SnapshotAllPerformancePeriodDto } from './dto/snapshot-all-performance-period.dto';
import { SkillsService } from '../skills/skills.service';
import { ContributionService } from '../contribution/contribution.service';
import { CertificatesService } from '../certificates/certificates.service';
import { EmployeesService } from '../employees/employees.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentPeriod(): { year: number; half: PerformancePeriodHalf } {
  const now = new Date();
  return { year: now.getFullYear(), half: now.getMonth() < 6 ? PerformancePeriodHalf.H1 : PerformancePeriodHalf.H2 };
}

function periodBounds(year: number, half: PerformancePeriodHalf): { periodStart: string; periodEnd: string } {
  return half === PerformancePeriodHalf.H1
    ? { periodStart: `${year}-01-01`, periodEnd: `${year}-06-30` }
    : { periodStart: `${year}-07-01`, periodEnd: `${year}-12-31` };
}

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

@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(PerformanceScoreRecord)
    private readonly recordRepository: Repository<PerformanceScoreRecord>,
    private readonly skillsService: SkillsService,
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
        .reduce((sum, r) => sum + Number(r.points), 0),
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
      const live = await this.computeLiveScoreForPeriod(employeeId, currentYear, currentHalf);
      const { periodStart, periodEnd } = periodBounds(currentYear, currentHalf);
      results.push({
        employeeId,
        year: currentYear,
        half: currentHalf,
        periodStart,
        periodEnd,
        ...live,
        totalScore: round2(live.technicalPoint + live.contributionPoints + live.certificatePoints),
        isFinal: false,
      });
    }

    return results.sort((a, b) => a.year - b.year || a.half.localeCompare(b.half));
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
