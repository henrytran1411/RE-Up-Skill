import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SkillCategory } from './entities/skill-category.entity';
import { Skill } from './entities/skill.entity';
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';
import { UpdateSkillCategoryDto } from './dto/update-skill-category.dto';

export interface SkillCategoryWithCount extends SkillCategory {
  skillCount: number;
}

@Injectable()
export class SkillCategoriesService {
  constructor(
    @InjectRepository(SkillCategory)
    private readonly categoryRepository: Repository<SkillCategory>,
    @InjectRepository(Skill)
    private readonly skillRepository: Repository<Skill>,
  ) {}

  async findAll(): Promise<SkillCategoryWithCount[]> {
    const categories = await this.categoryRepository.find({ order: { name: 'ASC' } });
    const counts = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.category', 'category')
      .addSelect('COUNT(skill.id)', 'count')
      .where('skill.category IS NOT NULL')
      .groupBy('skill.category')
      .getRawMany<{ category: string; count: string }>();
    const countByName = new Map(counts.map((c) => [c.category, Number(c.count)]));
    return categories.map((c) => ({ ...c, skillCount: countByName.get(c.name) ?? 0 }));
  }

  async findOne(id: string): Promise<SkillCategory> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Skill category ${id} not found`);
    }
    return category;
  }

  async create(dto: CreateSkillCategoryDto): Promise<SkillCategory> {
    const existing = await this.categoryRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Skill category "${dto.name}" already exists`);
    }
    const category = this.categoryRepository.create(dto);
    return this.categoryRepository.save(category);
  }

  /** Renaming cascades to every Skill row whose `category` matches the old name. */
  async update(id: string, dto: UpdateSkillCategoryDto): Promise<SkillCategory> {
    const category = await this.findOne(id);
    const isRename = dto.name !== undefined && dto.name !== category.name;
    if (isRename) {
      const collision = await this.categoryRepository.findOne({
        where: { name: dto.name as string, id: Not(id) },
      });
      if (collision) {
        throw new ConflictException(`Skill category "${dto.name}" already exists`);
      }
    }

    return this.categoryRepository.manager.transaction(async (manager) => {
      const oldName = category.name;
      if (dto.name !== undefined) {
        category.name = dto.name;
      }
      if (dto.description !== undefined) {
        category.description = dto.description;
      }
      if (dto.primaryWeight !== undefined) {
        category.primaryWeight = dto.primaryWeight;
      }
      if (dto.secondaryWeight !== undefined) {
        category.secondaryWeight = dto.secondaryWeight;
      }
      if (dto.priority !== undefined) {
        category.priority = dto.priority;
      }
      const saved = await manager.save(category);
      if (isRename) {
        await manager.update(Skill, { category: oldName }, { category: dto.name });
      }
      return saved;
    });
  }

  /** Blocked while any skill still references this category. */
  async remove(id: string): Promise<void> {
    const category = await this.findOne(id);
    const inUseCount = await this.skillRepository.count({ where: { category: category.name } });
    if (inUseCount > 0) {
      throw new ConflictException(
        `Cannot delete "${category.name}" — ${inUseCount} skill(s) still use it. Reassign or delete them first.`,
      );
    }
    await this.categoryRepository.remove(category);
  }
}
