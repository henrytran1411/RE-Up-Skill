import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Project } from './entities/project.entity';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpsertProjectDto } from './dto/upsert-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(TaskRecord)
    private readonly taskRepository: Repository<TaskRecord>,
  ) {}

  findByName(name: string): Promise<Project | null> {
    return this.projectRepository.findOne({ where: { name } });
  }

  findAll(): Promise<Project[]> {
    return this.projectRepository.find();
  }

  findAllByNames(names: string[]): Promise<Project[]> {
    if (names.length === 0) {
      return Promise.resolve([]);
    }
    return this.projectRepository.find({ where: { name: In(names) } });
  }

  /** Project names this employee is the assigned manager for — used to scope a PM's visibility. */
  async findManagedProjectNames(managerId: string): Promise<string[]> {
    const rows = await this.projectRepository.find({ where: { managerId }, select: { name: true } });
    return rows.map((r) => r.name);
  }

  /** Explicit create — used to stand up a project before any tasks are logged against it. */
  async createProject(dto: CreateProjectDto): Promise<Project> {
    const existing = await this.findByName(dto.name);
    if (existing) {
      throw new ConflictException(`Project "${dto.name}" already exists`);
    }
    const project = this.projectRepository.create({
      name: dto.name,
      revenue: dto.revenue ?? 0,
      managerId: dto.managerId ?? null,
      notes: dto.notes ?? null,
      startDate: dto.startDate ?? null,
      targetEndDate: dto.targetEndDate ?? null,
    });
    return this.projectRepository.save(project);
  }

  /**
   * Creates the project record if it doesn't exist yet, otherwise updates
   * whichever fields were provided. A `name` change renames the project and
   * cascades to every task record referencing the old name, since
   * `TaskRecord.projectName` is a free-text field rather than an FK.
   */
  async upsertProject(name: string, dto: UpsertProjectDto): Promise<Project> {
    const isRename = dto.name !== undefined && dto.name !== name;
    if (isRename) {
      const collision = await this.findByName(dto.name as string);
      if (collision) {
        throw new ConflictException(`Project "${dto.name}" already exists`);
      }
    }

    return this.projectRepository.manager.transaction(async (manager) => {
      let project = await manager.findOne(Project, { where: { name } });
      project ??= manager.create(Project, { name });
      if (dto.revenue !== undefined) {
        project.revenue = dto.revenue;
      }
      if (dto.managerId !== undefined) {
        project.managerId = dto.managerId;
      }
      if (dto.notes !== undefined) {
        project.notes = dto.notes;
      }
      if (dto.startDate !== undefined) {
        project.startDate = dto.startDate;
      }
      if (dto.targetEndDate !== undefined) {
        project.targetEndDate = dto.targetEndDate;
      }
      if (isRename) {
        await manager.update(TaskRecord, { projectName: name }, { projectName: dto.name });
        project.name = dto.name as string;
      }
      return manager.save(project);
    });
  }

  /** Blocked while any task record still references this project — remove/reassign those first. */
  async deleteProject(name: string): Promise<void> {
    const project = await this.findByName(name);
    if (!project) {
      throw new NotFoundException(`Project "${name}" not found`);
    }
    const taskCount = await this.taskRepository.count({ where: { projectName: name } });
    if (taskCount > 0) {
      throw new ConflictException(
        `Cannot delete "${name}" — it still has ${taskCount} task record(s). Remove or reassign them first.`,
      );
    }
    await this.projectRepository.remove(project);
  }
}
