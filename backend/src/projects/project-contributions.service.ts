import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectContribution } from './entities/project-contribution.entity';
import { EmployeesService } from '../employees/employees.service';

@Injectable()
export class ProjectContributionsService {
  constructor(
    @InjectRepository(ProjectContribution)
    private readonly contributionRepository: Repository<ProjectContribution>,
    private readonly employeesService: EmployeesService,
  ) {}

  /** Sensitive: only for HR/Admin viewing the ROI screen's inline rate editor, or internal ROI math. */
  async findRate(employeeId: string, projectName: string): Promise<number | null> {
    const row = await this.contributionRepository
      .createQueryBuilder('c')
      .addSelect('c.totalSalary')
      .where('c.employeeId = :employeeId', { employeeId })
      .andWhere('c.projectName = :projectName', { projectName })
      .getOne();
    return row?.totalSalary ?? null;
  }

  /** Batch rate lookup for ROI calculations — avoids one query per contributor. */
  async findRatesByEmployeeIds(employeeIds: string[], projectName: string): Promise<Map<string, number | null>> {
    if (employeeIds.length === 0) {
      return new Map();
    }
    const rows = await this.contributionRepository
      .createQueryBuilder('c')
      .select('c.employeeId', 'employeeId')
      .addSelect('c.totalSalary', 'totalSalary')
      .where('c.employeeId IN (:...employeeIds)', { employeeIds })
      .andWhere('c.projectName = :projectName', { projectName })
      .getRawMany<{ employeeId: string; totalSalary: string }>();
    const rateByEmployeeId = new Map(rows.map((r) => [r.employeeId, Number(r.totalSalary)]));
    return new Map(employeeIds.map((id) => [id, rateByEmployeeId.get(id) ?? null]));
  }

  /** The only way a contribution rate is ever set — entered manually from the ROI screen. Upserts: creates the row on first entry, updates it after. */
  async setRate(employeeId: string, projectName: string, totalSalary: number): Promise<void> {
    await this.employeesService.findOne(employeeId); // 404s if the employee doesn't exist
    const existing = await this.contributionRepository.findOne({ where: { employeeId, projectName } });
    if (existing) {
      await this.contributionRepository.update(existing.id, { totalSalary });
    } else {
      await this.contributionRepository.save(
        this.contributionRepository.create({ employeeId, projectName, totalSalary }),
      );
    }
  }
}
