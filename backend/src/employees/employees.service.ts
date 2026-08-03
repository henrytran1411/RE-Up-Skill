import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Employee } from './entities/employee.entity';
import { EmployeeLevelHistory } from './entities/employee-level-history.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { FindEmployeesQueryDto } from './dto/find-employees-query.dto';
import { Role } from '../common/enums/role.enum';
import { EmployeeStatus } from '../common/enums/employee-status.enum';
import { LevelHistorySource } from '../common/enums/level-history-source.enum';
import { diffInDays, today } from '../common/utils/date.util';

const SALT_ROUNDS = 10;

type EmployeeWithStatus = Employee & { status: EmployeeStatus };

export interface LevelHistoryEntry {
  id: string;
  /** Null only for legacy rows predating the SkillLevel-catalog migration. */
  level: string | null;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  source: LevelHistorySource;
  setById: string | null;
  triggeredBySkillId: string | null;
}

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(EmployeeLevelHistory)
    private readonly levelHistoryRepository: Repository<EmployeeLevelHistory>,
  ) {}

  /** Derived, not stored: no currentProject means the employee is currently on bench. */
  private attachStatus(employee: Employee): EmployeeWithStatus {
    return Object.assign(employee, {
      status: employee.currentProject ? EmployeeStatus.ON_PROJECT : EmployeeStatus.ON_BENCH,
    });
  }

  /**
   * Closes whatever level-history row is currently open for this employee (if
   * any) and opens a new one. This is the only way level-history rows should
   * ever be written — keeps the "one open row at a time" invariant intact.
   */
  private async openLevelHistory(
    employeeId: string,
    level: string,
    startDate: string,
    source: LevelHistorySource,
    setById: string | null,
    triggeredBySkillId: string | null = null,
  ): Promise<void> {
    await this.levelHistoryRepository.update(
      { employeeId, endDate: IsNull() },
      { endDate: startDate },
    );
    const entry = this.levelHistoryRepository.create({
      employeeId,
      level,
      startDate,
      endDate: null,
      source,
      setById,
      triggeredBySkillId,
    });
    await this.levelHistoryRepository.save(entry);
  }

  async create(dto: CreateEmployeeDto): Promise<EmployeeWithStatus> {
    const existing = await this.employeeRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An employee with this email already exists');
    }
    if (dto.jiraAccountId) {
      const jiraCollision = await this.findByJiraAccountId(dto.jiraAccountId);
      if (jiraCollision) {
        throw new ConflictException(`This Jira account is already mapped to ${jiraCollision.fullName}`);
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const employee = this.employeeRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      passwordHash,
      role: dto.role ?? Role.DEVELOPER,
      level: dto.level,
      levelEffectiveDate: dto.levelEffectiveDate,
      joinDate: dto.joinDate,
      currentProject: dto.currentProject ?? null,
      availableFrom: dto.availableFrom ?? null,
      jiraAccountId: dto.jiraAccountId ?? null,
    });

    const saved = await this.employeeRepository.save(employee);
    await this.openLevelHistory(saved.id, saved.level, saved.levelEffectiveDate, LevelHistorySource.INITIAL, null);
    return this.attachStatus(saved);
  }

  async findAll(query: FindEmployeesQueryDto = {}): Promise<EmployeeWithStatus[]> {
    const qb = this.employeeRepository
      .createQueryBuilder('employee')
      .orderBy('employee.createdAt', 'DESC');

    if (query.search) {
      qb.andWhere('(employee.fullName ILIKE :search OR employee.email ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }
    if (query.level) {
      qb.andWhere('employee.level = :level', { level: query.level });
    }
    if (query.role) {
      qb.andWhere('employee.role = :role', { role: query.role });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('employee.isActive = :isActive', { isActive: query.isActive === 'true' });
    }

    const employees = await qb.getMany();
    const withStatus = employees.map((employee) => this.attachStatus(employee));

    // status is derived, not a column, so it's filtered in-memory rather than in SQL
    return query.status ? withStatus.filter((e) => e.status === query.status) : withStatus;
  }

  async findOne(id: string): Promise<EmployeeWithStatus> {
    const employee = await this.employeeRepository.findOne({ where: { id } });
    if (!employee) {
      throw new NotFoundException(`Employee ${id} not found`);
    }
    return this.attachStatus(employee);
  }

  /** Includes passwordHash — for authentication use only, never expose via API responses. */
  findByEmailWithPassword(email: string): Promise<Employee | null> {
    return this.employeeRepository
      .createQueryBuilder('employee')
      .addSelect('employee.passwordHash')
      .where('employee.email = :email', { email })
      .getOne();
  }

  /** Plain email lookup — for matching an external identity (e.g. a Jira assignee) to an employee. */
  findByEmail(email: string): Promise<Employee | null> {
    return this.employeeRepository.findOne({ where: { email } });
  }

  /** Jira Cloud accountId lookup — see Employee.jiraAccountId and JiraService. */
  findByJiraAccountId(jiraAccountId: string): Promise<Employee | null> {
    return this.employeeRepository.findOne({ where: { jiraAccountId } });
  }

  /**
   * Applies the patch and, if it changes `level`, records the transition as a
   * MANUAL level-history entry (effective today, since there's no "effective
   * date" field on this form — HR is changing it right now).
   *
   * Uses a direct partial UPDATE rather than load-mutate-save: `passwordHash`
   * is `select: false`, so a loaded `Employee` instance never carries it —
   * saving that instance back would silently null the column out. A partial
   * update only touches the columns actually present in `dto`.
   */
  async update(id: string, dto: UpdateEmployeeDto, actingUserId: string): Promise<EmployeeWithStatus> {
    const previous = await this.findOne(id);

    if (dto.jiraAccountId) {
      const jiraCollision = await this.findByJiraAccountId(dto.jiraAccountId);
      if (jiraCollision && jiraCollision.id !== id) {
        throw new ConflictException(`This Jira account is already mapped to ${jiraCollision.fullName}`);
      }
    }

    await this.employeeRepository.update(id, dto);

    if (dto.level && dto.level !== previous.level) {
      await this.openLevelHistory(id, dto.level, today(), LevelHistorySource.MANUAL, actingUserId);
    }

    return this.findOne(id);
  }

  /** Full Junior -> Middle -> Senior timeline, each entry annotated with how many days it lasted. */
  async findLevelHistory(employeeId: string): Promise<LevelHistoryEntry[]> {
    await this.findOne(employeeId);
    const rows = await this.levelHistoryRepository.find({
      where: { employeeId },
      order: { startDate: 'ASC' },
    });
    const currentDate = today();
    return rows.map((row) => ({
      id: row.id,
      level: row.level,
      startDate: row.startDate,
      endDate: row.endDate,
      durationDays: diffInDays(row.startDate, row.endDate ?? currentDate),
      source: row.source,
      setById: row.setById,
      triggeredBySkillId: row.triggeredBySkillId,
    }));
  }

  /**
   * Admin-only cleanup of a single ledger row (e.g. purging legacy entries
   * left over from a removed feature or a data migration). Normally this
   * ledger is append-only — this is deliberately narrow and not exposed as
   * a general edit capability.
   */
  async deleteLevelHistoryEntry(employeeId: string, historyId: string): Promise<void> {
    const entry = await this.levelHistoryRepository.findOne({ where: { id: historyId } });
    if (entry?.employeeId !== employeeId) {
      throw new NotFoundException(`Level history entry ${historyId} not found for employee ${employeeId}`);
    }
    await this.levelHistoryRepository.remove(entry);
  }

  /**
   * Inserts a historical predecessor row ending exactly when the employee's
   * current earliest record begins (e.g. backfilling "was Middle before
   * becoming Senior"), for cases where the real history predates when this
   * ledger started being written. HR/Admin only — for filling in known past
   * fact, not for editing the live/current level (use `update` for that).
   */
  async backfillLevelHistory(employeeId: string, level: string, startDate: string): Promise<void> {
    await this.findOne(employeeId);
    const earliest = await this.levelHistoryRepository.findOne({
      where: { employeeId },
      order: { startDate: 'ASC' },
    });
    const endDate = earliest ? earliest.startDate : today();
    if (startDate >= endDate) {
      throw new BadRequestException(
        `startDate must be before this employee's earliest existing level-history record (${endDate})`,
      );
    }

    const entry = this.levelHistoryRepository.create({
      employeeId,
      level,
      startDate,
      endDate,
      source: LevelHistorySource.MANUAL,
      setById: null,
      triggeredBySkillId: null,
    });
    await this.levelHistoryRepository.save(entry);
  }

  /** Plain names for display (e.g. "managed by X") — not sensitive, no addSelect needed. */
  async findNamesByIds(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.employeeRepository.find({
      where: { id: In(ids) },
      select: { id: true, fullName: true },
    });
    return new Map(rows.map((r) => [r.id, r.fullName]));
  }

  /** Jira account ids for a batch of employees — used to set the assignee when pushing local tasks to Jira. Null where an employee has no mapped Jira account. */
  async findJiraAccountIdsByIds(ids: string[]): Promise<Map<string, string | null>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.employeeRepository.find({
      where: { id: In(ids) },
      select: { id: true, jiraAccountId: true },
    });
    return new Map(rows.map((r) => [r.id, r.jiraAccountId]));
  }

  async remove(id: string): Promise<void> {
    const employee = await this.findOne(id);
    await this.employeeRepository.remove(employee);
  }
}
