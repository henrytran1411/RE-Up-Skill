import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { EmployeeLevel } from './entities/employee-level.entity';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeLevelDto } from './dto/create-employee-level.dto';
import { UpdateEmployeeLevelDto } from './dto/update-employee-level.dto';

@Injectable()
export class EmployeeLevelsService {
  constructor(
    @InjectRepository(EmployeeLevel)
    private readonly employeeLevelRepository: Repository<EmployeeLevel>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  findAll(): Promise<EmployeeLevel[]> {
    return this.employeeLevelRepository.find({ order: { sortOrder: 'ASC' } });
  }

  async findOne(id: string): Promise<EmployeeLevel> {
    const level = await this.employeeLevelRepository.findOne({ where: { id } });
    if (!level) {
      throw new NotFoundException(`Employee level ${id} not found`);
    }
    return level;
  }

  async create(dto: CreateEmployeeLevelDto): Promise<EmployeeLevel> {
    const existing = await this.employeeLevelRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Employee level "${dto.name}" already exists`);
    }
    const level = this.employeeLevelRepository.create(dto);
    return this.employeeLevelRepository.save(level);
  }

  async update(id: string, dto: UpdateEmployeeLevelDto): Promise<EmployeeLevel> {
    const current = await this.findOne(id);
    if (dto.name !== undefined && dto.name !== current.name) {
      const collision = await this.employeeLevelRepository.findOne({ where: { name: dto.name, id: Not(id) } });
      if (collision) {
        throw new ConflictException(`Employee level "${dto.name}" already exists`);
      }
    }
    await this.employeeLevelRepository.update(id, dto);
    return this.findOne(id);
  }

  /** Blocked while any employee currently holds this level — reassign them first. */
  async remove(id: string): Promise<void> {
    const level = await this.findOne(id);
    const inUse = await this.employeeRepository.count({ where: { level: level.name } });
    if (inUse > 0) {
      throw new ConflictException(`Cannot delete "${level.name}" — ${inUse} employee(s) currently hold this level.`);
    }
    await this.employeeLevelRepository.remove(level);
  }
}
