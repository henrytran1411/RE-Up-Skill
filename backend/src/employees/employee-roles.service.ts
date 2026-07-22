import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { EmployeeRole } from './entities/employee-role.entity';
import { Employee } from './entities/employee.entity';
import { CreateEmployeeRoleDto } from './dto/create-employee-role.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';

@Injectable()
export class EmployeeRolesService {
  constructor(
    @InjectRepository(EmployeeRole)
    private readonly employeeRoleRepository: Repository<EmployeeRole>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  findAll(): Promise<EmployeeRole[]> {
    return this.employeeRoleRepository.find({ order: { sortOrder: 'ASC' } });
  }

  async findOne(id: string): Promise<EmployeeRole> {
    const role = await this.employeeRoleRepository.findOne({ where: { id } });
    if (!role) {
      throw new NotFoundException(`Employee role ${id} not found`);
    }
    return role;
  }

  async create(dto: CreateEmployeeRoleDto): Promise<EmployeeRole> {
    const existing = await this.employeeRoleRepository.findOne({ where: { name: dto.name } });
    if (existing) {
      throw new ConflictException(`Employee role "${dto.name}" already exists`);
    }
    const role = this.employeeRoleRepository.create(dto);
    return this.employeeRoleRepository.save(role);
  }

  async update(id: string, dto: UpdateEmployeeRoleDto): Promise<EmployeeRole> {
    const current = await this.findOne(id);
    if (dto.name !== undefined && dto.name !== current.name) {
      const collision = await this.employeeRoleRepository.findOne({ where: { name: dto.name, id: Not(id) } });
      if (collision) {
        throw new ConflictException(`Employee role "${dto.name}" already exists`);
      }
    }
    await this.employeeRoleRepository.update(id, dto);
    return this.findOne(id);
  }

  /** Blocked while any employee currently holds this role — reassign them first. */
  async remove(id: string): Promise<void> {
    const role = await this.findOne(id);
    const inUse = await this.employeeRepository.count({ where: { role: role.name } });
    if (inUse > 0) {
      throw new ConflictException(`Cannot delete "${role.name}" — ${inUse} employee(s) currently hold this role.`);
    }
    await this.employeeRoleRepository.remove(role);
  }
}
