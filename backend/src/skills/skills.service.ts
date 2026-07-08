import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill, SkillTrack } from './entities/employee-skill.entity';
import { SkillCategory } from './entities/skill-category.entity';
import { SkillLevel } from './entities/skill-level.entity';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { DeclareEmployeeSkillDto } from './dto/declare-employee-skill.dto';
import { UpdateEmployeeSkillDto } from './dto/update-employee-skill.dto';
import { FindEmployeeSkillsQueryDto } from './dto/find-employee-skills-query.dto';
import { SkillStatus } from '../common/enums/skill-status.enum';
import { CompanyNeedLevel } from '../common/enums/company-need-level.enum';
import { MANAGER_ROLES, Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { EmployeesService } from '../employees/employees.service';
import { diffInDays, today } from '../common/utils/date.util';

type EmployeeSkillWithDuration = EmployeeSkill & { durationDays: number };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface TechnicalPointSkillLine {
  employeeSkillId: string;
  skillName: string;
  category: string | null;
  level: string;
  levelWeight: number;
  keyMultiplier: number;
  isPrimary: boolean;
  isFoundational: boolean;
  categoryPrimaryWeight: number;
  categorySecondaryWeight: number;
  /** Contribution to A (primary-category points) — 0 unless isPrimary. */
  contributionToA: number;
  /** Contribution to B (non-primary-category points) — 0 unless !isPrimary. */
  contributionToB: number;
  /** Contribution to C (foundational points) — 0 unless isFoundational. */
  contributionToC: number;
}

export interface TechnicalPointBreakdown {
  employeeId: string;
  /** A: total points from all primary skills across every category. */
  primaryPoints: number;
  /** B: total points from all non-primary skills across every category. */
  nonPrimaryPoints: number;
  /** C: total points from every foundational skill. */
  foundationalPoints: number;
  /** T = A + B + C. */
  totalPoints: number;
  skills: TechnicalPointSkillLine[];
}

export interface SuggestedSkill {
  id: string;
  name: string;
  isFoundational: boolean;
  isKeySkill: boolean;
  companyNeedLevel: CompanyNeedLevel;
}

export interface SkillGapSuggestion {
  categoryId: string;
  categoryName: string;
  /** 1 (low) to 4 (highest) — see SkillCategory.priority. Suggestions are sorted by this, descending. */
  priority: number;
  description: string | null;
  suggestedSkills: SuggestedSkill[];
}

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
    @InjectRepository(EmployeeSkill)
    private readonly employeeSkillRepository: Repository<EmployeeSkill>,
    @InjectRepository(SkillCategory)
    private readonly skillCategoryRepository: Repository<SkillCategory>,
    @InjectRepository(SkillLevel)
    private readonly skillLevelRepository: Repository<SkillLevel>,
    private readonly employeesService: EmployeesService,
  ) {}

  /** Days spent so far in this entry's [startDate, endDate ?? today] window. */
  private attachDuration(entry: EmployeeSkill): EmployeeSkillWithDuration {
    return Object.assign(entry, {
      durationDays: diffInDays(entry.startDate, entry.endDate ?? today()),
    });
  }

  createSkill(dto: CreateSkillDto): Promise<Skill> {
    const skill = this.skillRepository.create(dto);
    return this.skillRepository.save(skill);
  }

  findAllSkills(): Promise<Skill[]> {
    return this.skillRepository.find({ order: { name: 'ASC' } });
  }

  async findOneSkill(id: string): Promise<Skill> {
    const skill = await this.skillRepository.findOne({ where: { id } });
    if (!skill) {
      throw new NotFoundException(`Skill ${id} not found`);
    }
    return skill;
  }

  async updateSkill(id: string, dto: UpdateSkillDto): Promise<Skill> {
    await this.findOneSkill(id);
    if (dto.name !== undefined) {
      const collision = await this.skillRepository.findOne({ where: { name: dto.name, id: Not(id) } });
      if (collision) {
        throw new ConflictException(`A skill named "${dto.name}" already exists`);
      }
    }
    await this.skillRepository.update(id, dto);
    return this.findOneSkill(id);
  }

  /** Blocked while any employee still has a skill-history entry against this skill. */
  async deleteSkill(id: string): Promise<void> {
    const skill = await this.findOneSkill(id);
    const inUseCount = await this.employeeSkillRepository.count({ where: { skillId: id } });
    if (inUseCount > 0) {
      throw new ConflictException(
        `Cannot delete "${skill.name}" — ${inUseCount} employee skill-history record(s) reference it.`,
      );
    }
    await this.skillRepository.remove(skill);
  }

  async findMatrixForEmployee(employeeId: string): Promise<EmployeeSkillWithDuration[]> {
    const entries = await this.employeeSkillRepository.find({
      where: { employeeId },
      order: { startDate: 'ASC' },
    });
    return entries.map((entry) => this.attachDuration(entry));
  }

  /**
   * T = A + B + C, where per confirmed CURRENT-track skill entry:
   *   base = (SkillLevel.weight for this entry's level) * (Skill.keySkillMultiplier, 1 if unset)
   *   A += base * category.primaryWeight   — only for entries where isPrimary
   *   B += base * category.secondaryWeight — only for entries where !isPrimary
   *   C += base * category.primaryWeight   — only for entries where skill.isFoundational
   * A skill that is both primary and foundational contributes to both A and
   * C — intentional per the formula, not a bug. Entries whose level or
   * category don't resolve to a catalog row contribute 0 for that factor
   * (fail-safe) rather than guessing a value.
   */
  private buildTechnicalPointBreakdown(
    employeeId: string,
    entries: EmployeeSkill[],
    weightByLevelName: Map<string, number>,
    categoryByName: Map<string, SkillCategory>,
  ): TechnicalPointBreakdown {
    let primaryPoints = 0;
    let nonPrimaryPoints = 0;
    let foundationalPoints = 0;

    const skills: TechnicalPointSkillLine[] = entries
      .filter((entry): entry is EmployeeSkill & { level: string } => entry.level !== null)
      .map((entry) => {
        const levelWeight = weightByLevelName.get(entry.level) ?? 0;
        const keyMultiplier = entry.skill.keySkillMultiplier ?? 1;
        const category = entry.skill.category ? categoryByName.get(entry.skill.category) : undefined;
        const categoryPrimaryWeight = category?.primaryWeight ?? 0;
        const categorySecondaryWeight = category?.secondaryWeight ?? 0;
        const base = levelWeight * keyMultiplier;

        const contributionToA = entry.isPrimary ? round2(base * categoryPrimaryWeight) : 0;
        const contributionToB = entry.isPrimary ? 0 : round2(base * categorySecondaryWeight);
        const contributionToC = entry.skill.isFoundational ? round2(base * categoryPrimaryWeight) : 0;

        primaryPoints += contributionToA;
        nonPrimaryPoints += contributionToB;
        foundationalPoints += contributionToC;

        return {
          employeeSkillId: entry.id,
          skillName: entry.skill.name,
          category: entry.skill.category,
          level: entry.level,
          levelWeight,
          keyMultiplier,
          isPrimary: entry.isPrimary,
          isFoundational: entry.skill.isFoundational,
          categoryPrimaryWeight,
          categorySecondaryWeight,
          contributionToA,
          contributionToB,
          contributionToC,
        };
      });

    return {
      employeeId,
      primaryPoints: round2(primaryPoints),
      nonPrimaryPoints: round2(nonPrimaryPoints),
      foundationalPoints: round2(foundationalPoints),
      totalPoints: round2(primaryPoints + nonPrimaryPoints + foundationalPoints),
      skills,
    };
  }

  private async loadLevelAndCategoryMaps(): Promise<{
    weightByLevelName: Map<string, number>;
    categoryByName: Map<string, SkillCategory>;
  }> {
    const [levels, categories] = await Promise.all([
      this.skillLevelRepository.find(),
      this.skillCategoryRepository.find(),
    ]);
    return {
      weightByLevelName: new Map(levels.map((l) => [l.name, l.weight])),
      categoryByName: new Map(categories.map((c) => [c.name, c])),
    };
  }

  /** Technical point (T) for one employee — see buildTechnicalPointBreakdown for the formula. */
  async findTechnicalPointForEmployee(employeeId: string): Promise<TechnicalPointBreakdown> {
    const [entries, { weightByLevelName, categoryByName }] = await Promise.all([
      this.employeeSkillRepository.find({
        where: { employeeId, track: SkillTrack.CURRENT, status: SkillStatus.CONFIRMED },
      }),
      this.loadLevelAndCategoryMaps(),
    ]);
    return this.buildTechnicalPointBreakdown(employeeId, entries, weightByLevelName, categoryByName);
  }

  /** Technical point (T) for every employee, including those with none yet (T=0). */
  async findAllTechnicalPoints(): Promise<TechnicalPointBreakdown[]> {
    const [employees, allConfirmedCurrent, { weightByLevelName, categoryByName }] = await Promise.all([
      this.employeesService.findAll(),
      this.employeeSkillRepository.find({
        where: { track: SkillTrack.CURRENT, status: SkillStatus.CONFIRMED },
      }),
      this.loadLevelAndCategoryMaps(),
    ]);

    const entriesByEmployeeId = new Map<string, EmployeeSkill[]>();
    for (const entry of allConfirmedCurrent) {
      const list = entriesByEmployeeId.get(entry.employeeId) ?? [];
      list.push(entry);
      entriesByEmployeeId.set(entry.employeeId, list);
    }

    return employees.map((employee) =>
      this.buildTechnicalPointBreakdown(
        employee.id,
        entriesByEmployeeId.get(employee.id) ?? [],
        weightByLevelName,
        categoryByName,
      ),
    );
  }

  /**
   * Skill-catalog gaps to suggest, sorted by category priority high to low.
   * A category is suggested when the employee is missing at least one
   * catalog skill there (any track/status counts as "has it"), AND either:
   *   - they have NO skill there at all yet, OR
   *   - the category is high priority (3-4), OR
   *   - they're missing a VERY_NEEDED skill specifically.
   * A category where they already hold every relevant skill (or where their
   * only gaps are low-priority and not VERY_NEEDED) is left out — they
   * already have a foothold and there's nothing urgent left to add.
   * DONT_NEED skills are never suggested. Within a category, missing skills
   * are ranked by company need (VERY_NEEDED first), then foundational-first.
   */
  async findLearningSuggestionsForEmployee(employeeId: string): Promise<SkillGapSuggestion[]> {
    const [categories, employeeSkills, allSkills] = await Promise.all([
      this.skillCategoryRepository.find(),
      this.employeeSkillRepository.find({ where: { employeeId } }),
      this.skillRepository.find(),
    ]);

    const knownSkillIdsByCategory = new Map<string, Set<string>>();
    for (const entry of employeeSkills) {
      const category = entry.skill?.category;
      if (!category) {
        continue;
      }
      const set = knownSkillIdsByCategory.get(category) ?? new Set<string>();
      set.add(entry.skillId);
      knownSkillIdsByCategory.set(category, set);
    }

    const needRank: Record<CompanyNeedLevel, number> = {
      [CompanyNeedLevel.VERY_NEEDED]: 0,
      [CompanyNeedLevel.NORMALLY]: 1,
      [CompanyNeedLevel.DONT_NEED]: 2,
    };
    const skillsByCategory = new Map<string, Skill[]>();
    for (const skill of allSkills) {
      if (!skill.category || skill.companyNeedLevel === CompanyNeedLevel.DONT_NEED) {
        continue;
      }
      const list = skillsByCategory.get(skill.category) ?? [];
      list.push(skill);
      skillsByCategory.set(skill.category, list);
    }

    return categories
      .map((category) => {
        const knownSkillIds = knownSkillIdsByCategory.get(category.name) ?? new Set<string>();
        const missingSkills = (skillsByCategory.get(category.name) ?? []).filter(
          (skill) => !knownSkillIds.has(skill.id),
        );
        if (missingSkills.length === 0) {
          return null;
        }

        const hasFoothold = knownSkillIds.size > 0;
        if (hasFoothold) {
          const isHighPriority = category.priority >= 3;
          const missingVeryNeeded = missingSkills.some(
            (skill) => skill.companyNeedLevel === CompanyNeedLevel.VERY_NEEDED,
          );
          if (!isHighPriority && !missingVeryNeeded) {
            return null;
          }
        }

        const suggestedSkills = missingSkills
          .slice()
          .sort((a, b) => {
            if (needRank[a.companyNeedLevel] !== needRank[b.companyNeedLevel]) {
              return needRank[a.companyNeedLevel] - needRank[b.companyNeedLevel];
            }
            if (a.isFoundational !== b.isFoundational) {
              return a.isFoundational ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
          })
          .map((skill) => ({
            id: skill.id,
            name: skill.name,
            isFoundational: skill.isFoundational,
            isKeySkill: skill.isKeySkill,
            companyNeedLevel: skill.companyNeedLevel,
          }));

        return {
          categoryId: category.id,
          categoryName: category.name,
          priority: category.priority,
          description: category.description,
          suggestedSkills,
        };
      })
      .filter((suggestion): suggestion is SkillGapSuggestion => suggestion !== null)
      .sort((a, b) => b.priority - a.priority || a.categoryName.localeCompare(b.categoryName));
  }

  /** Skill-history entries awaiting a PM/Tech Lead action, across all employees. */
  async findPendingReviews(): Promise<EmployeeSkillWithDuration[]> {
    const entries = await this.employeeSkillRepository.find({
      where: { status: Not(SkillStatus.CONFIRMED) },
      relations: ['employee'],
      order: { createdAt: 'ASC' },
    });
    return entries.map((entry) => this.attachDuration(entry));
  }

  /**
   * Full search/filter across all employees' skill-history entries, for
   * PM/HR management views. Passing both `employeeId` and `skillId` narrows
   * this to one skill's full learning timeline for one employee — e.g. every
   * stretch of time Employee A spent studying React, Junior through Senior.
   */
  async findHistory(query: FindEmployeeSkillsQueryDto): Promise<EmployeeSkillWithDuration[]> {
    const qb = this.employeeSkillRepository
      .createQueryBuilder('es')
      .leftJoinAndSelect('es.skill', 'skill')
      .leftJoinAndSelect('es.employee', 'employee')
      .orderBy('es.createdAt', 'DESC');

    if (query.employeeId) {
      qb.andWhere('es.employeeId = :employeeId', { employeeId: query.employeeId });
    }
    if (query.skillId) {
      qb.andWhere('es.skillId = :skillId', { skillId: query.skillId });
    }
    if (query.track) {
      qb.andWhere('es.track = :track', { track: query.track });
    }
    if (query.status) {
      qb.andWhere('es.status = :status', { status: query.status });
    }
    if (query.level) {
      qb.andWhere('es.level = :level', { level: query.level });
    }
    if (query.search) {
      qb.andWhere('skill.name ILIKE :search', { search: `%${query.search}%` });
    }

    const entries = await qb.getMany();
    return entries.map((entry) => this.attachDuration(entry));
  }

  private async findByIdOrThrow(employeeSkillId: string): Promise<EmployeeSkill> {
    const employeeSkill = await this.employeeSkillRepository.findOne({
      where: { id: employeeSkillId },
    });
    if (!employeeSkill) {
      throw new NotFoundException(`Employee skill ${employeeSkillId} not found`);
    }
    return employeeSkill;
  }

  /** Employee creates a new skill-history entry, tracked over [startDate, endDate]. Starts at status START. */
  async declareSkill(employeeId: string, dto: DeclareEmployeeSkillDto): Promise<EmployeeSkill> {
    const skill = await this.skillRepository.findOne({ where: { id: dto.skillId } });
    if (!skill) {
      throw new NotFoundException(`Skill ${dto.skillId} not found`);
    }
    if (dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    const employeeSkill = this.employeeSkillRepository.create({
      employeeId,
      skillId: dto.skillId,
      track: dto.track,
      proficiency: dto.proficiency,
      targetProficiency: dto.targetProficiency ?? null,
      progressPercent: dto.progressPercent ?? null,
      level: dto.level ?? null,
      status: SkillStatus.START,
      startDate: dto.startDate,
      endDate: dto.endDate ?? null,
    });

    return this.employeeSkillRepository.save(employeeSkill);
  }

  /** Employee logs progress on their own skill-history entry; moves START -> LEARNING on first update. */
  async updateProgress(
    employeeSkillId: string,
    employeeId: string,
    progressPercent: number,
    proficiency?: number,
  ): Promise<EmployeeSkill> {
    const employeeSkill = await this.findByIdOrThrow(employeeSkillId);
    if (employeeSkill.employeeId !== employeeId) {
      throw new ForbiddenException('You can only update your own skill progress');
    }

    employeeSkill.progressPercent = progressPercent;
    if (proficiency !== undefined) {
      employeeSkill.proficiency = proficiency;
    }
    if (employeeSkill.status === SkillStatus.START) {
      employeeSkill.status = SkillStatus.LEARNING;
    }
    return this.employeeSkillRepository.save(employeeSkill);
  }

  /** PM/Tech Lead reviews evidence and marks the entry verified. */
  async verifySkill(employeeSkillId: string, verifierId: string): Promise<EmployeeSkill> {
    const employeeSkill = await this.findByIdOrThrow(employeeSkillId);
    if (employeeSkill.status !== SkillStatus.START && employeeSkill.status !== SkillStatus.LEARNING) {
      throw new BadRequestException(
        `Cannot verify a skill in status "${employeeSkill.status}"; it must be in "start" or "learning"`,
      );
    }

    employeeSkill.status = SkillStatus.VERIFIED;
    employeeSkill.verifiedById = verifierId;
    employeeSkill.verifiedAt = new Date();
    return this.employeeSkillRepository.save(employeeSkill);
  }

  /**
   * PM/Tech Lead gives final sign-off; closes out the tracked date range if
   * still open. This never changes the employee's overall level — skill
   * level and career level are independent scales; career level only moves
   * via a deliberate HR/Admin edit (see EmployeesService#update).
   */
  async confirmSkill(employeeSkillId: string, confirmerId: string): Promise<EmployeeSkill> {
    const employeeSkill = await this.findByIdOrThrow(employeeSkillId);
    if (employeeSkill.status !== SkillStatus.VERIFIED) {
      throw new BadRequestException(
        `Cannot confirm a skill in status "${employeeSkill.status}"; it must be "verified" first`,
      );
    }

    employeeSkill.status = SkillStatus.CONFIRMED;
    employeeSkill.confirmedById = confirmerId;
    employeeSkill.confirmedAt = new Date();
    if (!employeeSkill.endDate) {
      employeeSkill.endDate = new Date().toISOString().slice(0, 10);
    }
    return this.employeeSkillRepository.save(employeeSkill);
  }

  /**
   * Marks this entry as the employee's primary (flagship) skill within its
   * category, un-marking any other entry that was primary in that same
   * category for the same employee. Only a CURRENT-track entry can be
   * primary — a still-learning skill isn't a flagship yet. The owning
   * employee may set their own; PM/HR/Tech Lead/Admin may set anyone's.
   */
  async setPrimarySkill(employeeSkillId: string, requester: AuthenticatedUser): Promise<EmployeeSkill> {
    const employeeSkill = await this.findByIdOrThrow(employeeSkillId);
    const isManager = MANAGER_ROLES.includes(requester.role as Role);
    if (!isManager && employeeSkill.employeeId !== requester.employeeId) {
      throw new ForbiddenException('You can only set your own skill as primary');
    }
    if (employeeSkill.track !== SkillTrack.CURRENT) {
      throw new BadRequestException('Only a current-track skill can be marked primary');
    }

    const category = employeeSkill.skill.category;
    const sameCategorySkills = await this.skillRepository.find({
      where: { category: category ?? IsNull() },
      select: { id: true },
    });
    const skillIds = sameCategorySkills.map((s) => s.id);
    if (skillIds.length > 0) {
      await this.employeeSkillRepository.update(
        { employeeId: employeeSkill.employeeId, skillId: In(skillIds), id: Not(employeeSkillId) },
        { isPrimary: false },
      );
    }

    employeeSkill.isPrimary = true;
    return this.employeeSkillRepository.save(employeeSkill);
  }

  /**
   * PM/HR/Tech Lead/Admin can edit any entry at any time. The owning employee
   * can only edit their own entry while it's still unreviewed (START/LEARNING)
   * — once a PM has verified it, further changes must go through them.
   * Never touches the employee's overall level — see confirmSkill.
   */
  async updateEmployeeSkill(
    employeeSkillId: string,
    requester: AuthenticatedUser,
    dto: UpdateEmployeeSkillDto,
  ): Promise<EmployeeSkill> {
    const employeeSkill = await this.findByIdOrThrow(employeeSkillId);
    this.assertCanModify(employeeSkill, requester, 'edit');

    const startDate = dto.startDate ?? employeeSkill.startDate;
    const endDate = dto.endDate ?? employeeSkill.endDate;
    if (endDate && endDate < startDate) {
      throw new BadRequestException('endDate cannot be before startDate');
    }

    Object.assign(employeeSkill, dto);
    return this.employeeSkillRepository.save(employeeSkill);
  }

  /**
   * Same ownership rule as updateEmployeeSkill, but the owner may only delete
   * their entry while it's still at START (delete-your-mistake, not
   * delete-your-history-once-someone-has-engaged-with-it).
   */
  async deleteEmployeeSkill(employeeSkillId: string, requester: AuthenticatedUser): Promise<void> {
    const employeeSkill = await this.findByIdOrThrow(employeeSkillId);
    this.assertCanModify(employeeSkill, requester, 'delete', [SkillStatus.START]);
    await this.employeeSkillRepository.remove(employeeSkill);
  }

  private assertCanModify(
    employeeSkill: EmployeeSkill,
    requester: AuthenticatedUser,
    action: string,
    ownerAllowedStatuses: SkillStatus[] = [SkillStatus.START, SkillStatus.LEARNING],
  ): void {
    const isManager = MANAGER_ROLES.includes(requester.role as Role);
    if (isManager) {
      return;
    }
    if (employeeSkill.employeeId !== requester.employeeId) {
      throw new ForbiddenException(`You can only ${action} your own skill history entries`);
    }
    if (!ownerAllowedStatuses.includes(employeeSkill.status)) {
      throw new ForbiddenException(
        `Cannot ${action} a skill once it has been verified; ask a PM/Tech Lead to make changes`,
      );
    }
  }
}
