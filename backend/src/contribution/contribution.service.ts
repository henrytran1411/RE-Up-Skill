import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContributionRecord } from './entities/contribution-record.entity';
import { CreateContributionRecordDto } from './dto/create-contribution-record.dto';
import { UpdateContributionRecordDto } from './dto/update-contribution-record.dto';
import { ContributionSource } from '../common/enums/contribution-source.enum';
import { EmployeesService } from '../employees/employees.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ContributionYearSummary {
  employeeId: string;
  year: number;
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
  ) {}

  async findOne(id: string): Promise<ContributionRecord> {
    const record = await this.contributionRepository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException(`Contribution record ${id} not found`);
    }
    return record;
  }

  /** Admin-only: logs one point entry against an employee's contribution ledger. */
  async create(dto: CreateContributionRecordDto, recordedById: string): Promise<ContributionRecord> {
    await this.employeesService.findOne(dto.employeeId);
    const record = this.contributionRepository.create({ ...dto, recordedById });
    return this.contributionRepository.save(record);
  }

  /** Admin-only: edits any field on an existing entry, including reassigning it to a different employee. */
  async update(id: string, dto: UpdateContributionRecordDto): Promise<ContributionRecord> {
    const record = await this.findOne(id);
    if (dto.employeeId !== undefined) {
      await this.employeesService.findOne(dto.employeeId);
    }
    Object.assign(record, dto);
    return this.contributionRepository.save(record);
  }

  /** Admin-only. */
  async remove(id: string): Promise<void> {
    const record = await this.findOne(id);
    await this.contributionRepository.remove(record);
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
}
