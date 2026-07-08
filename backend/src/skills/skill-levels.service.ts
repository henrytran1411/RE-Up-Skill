import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { SkillLevel } from './entities/skill-level.entity';
import { CreateSkillLevelDto } from './dto/create-skill-level.dto';
import { UpdateSkillLevelDto } from './dto/update-skill-level.dto';

@Injectable()
export class SkillLevelsService {
  constructor(
    @InjectRepository(SkillLevel)
    private readonly skillLevelRepository: Repository<SkillLevel>,
  ) {}

  findAll(): Promise<SkillLevel[]> {
    return this.skillLevelRepository.find({ order: { weight: 'ASC' } });
  }

  async findOne(id: string): Promise<SkillLevel> {
    const level = await this.skillLevelRepository.findOne({ where: { id } });
    if (!level) {
      throw new NotFoundException(`Skill level ${id} not found`);
    }
    return level;
  }

  async create(dto: CreateSkillLevelDto): Promise<SkillLevel> {
    const existing = await this.skillLevelRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Skill level "${dto.name}" already exists`);
    }
    const level = this.skillLevelRepository.create(dto);
    return this.skillLevelRepository.save(level);
  }

  async update(id: string, dto: UpdateSkillLevelDto): Promise<SkillLevel> {
    await this.findOne(id);
    if (dto.name !== undefined) {
      const collision = await this.skillLevelRepository.findOne({ where: { name: dto.name, id: Not(id) } });
      if (collision) {
        throw new ConflictException(`Skill level "${dto.name}" already exists`);
      }
    }
    await this.skillLevelRepository.update(id, dto);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const level = await this.findOne(id);
    await this.skillLevelRepository.remove(level);
  }
}
