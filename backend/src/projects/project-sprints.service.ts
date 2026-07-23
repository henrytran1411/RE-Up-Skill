import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { ProjectSprint } from './entities/project-sprint.entity';
import { TaskRecord } from '../tasks/entities/task-record.entity';
import { ProjectsService } from './projects.service';
import { CreateProjectSprintDto } from './dto/create-project-sprint.dto';
import { UpdateProjectSprintDto } from './dto/update-project-sprint.dto';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ProjectSprintsService {
  constructor(
    @InjectRepository(ProjectSprint)
    private readonly sprintRepository: Repository<ProjectSprint>,
    @InjectRepository(TaskRecord)
    private readonly taskRepository: Repository<TaskRecord>,
    private readonly projectsService: ProjectsService,
  ) {}

  /** PM may only manage sprints for a project they're the assigned manager of; other mutating roles are unrestricted. */
  private async ensurePmManagesProject(requester: AuthenticatedUser, projectName: string): Promise<void> {
    if (requester.role !== Role.PM) {
      return;
    }
    const project = await this.projectsService.findByName(projectName);
    if (project?.managerId !== requester.employeeId) {
      throw new ForbiddenException('You can only manage sprints for projects you manage');
    }
  }

  findAllForProject(projectName: string): Promise<ProjectSprint[]> {
    return this.sprintRepository.find({ where: { projectName }, order: { sprintNumber: 'ASC' } });
  }

  private async findOneOrFail(projectName: string, id: string): Promise<ProjectSprint> {
    const sprint = await this.sprintRepository.findOne({ where: { id, projectName } });
    if (!sprint) {
      throw new NotFoundException(`Sprint ${id} not found for project "${projectName}"`);
    }
    return sprint;
  }

  async create(projectName: string, dto: CreateProjectSprintDto, requester: AuthenticatedUser): Promise<ProjectSprint> {
    await this.ensurePmManagesProject(requester, projectName);
    const existing = await this.sprintRepository.findOne({ where: { projectName, sprintNumber: dto.sprintNumber } });
    if (existing) {
      throw new ConflictException(`Sprint ${dto.sprintNumber} already exists for "${projectName}"`);
    }
    const sprint = this.sprintRepository.create({ ...dto, projectName });
    return this.sprintRepository.save(sprint);
  }

  async update(
    projectName: string,
    id: string,
    dto: UpdateProjectSprintDto,
    requester: AuthenticatedUser,
  ): Promise<ProjectSprint> {
    await this.ensurePmManagesProject(requester, projectName);
    const current = await this.findOneOrFail(projectName, id);
    if (dto.sprintNumber !== undefined && dto.sprintNumber !== current.sprintNumber) {
      const collision = await this.sprintRepository.findOne({
        where: { projectName, sprintNumber: dto.sprintNumber, id: Not(id) },
      });
      if (collision) {
        throw new ConflictException(`Sprint ${dto.sprintNumber} already exists for "${projectName}"`);
      }
    }
    await this.sprintRepository.update(id, dto);
    return this.findOneOrFail(projectName, id);
  }

  /** Blocked while any task is still assigned to this sprint — reassign them first. */
  async remove(projectName: string, id: string, requester: AuthenticatedUser): Promise<void> {
    await this.ensurePmManagesProject(requester, projectName);
    const sprint = await this.findOneOrFail(projectName, id);
    const inUse = await this.taskRepository.count({ where: { projectSprintId: sprint.id } });
    if (inUse > 0) {
      throw new ConflictException(
        `Cannot delete sprint ${sprint.sprintNumber} — ${inUse} task(s) are still assigned to it. Reassign them first.`,
      );
    }
    await this.sprintRepository.remove(sprint);
  }

  /**
   * Bulk-creates sequential 2-week (14 calendar day / 10 working day) sprints
   * spanning the project's startDate through targetEndDate, numbered from 1.
   * Sprint numbers that already exist are left untouched — this only fills
   * in the gaps, so it's safe to re-run after manually tweaking a sprint.
   * The final sprint's endDate is clipped to targetEndDate.
   */
  async generate(projectName: string, requester: AuthenticatedUser): Promise<ProjectSprint[]> {
    await this.ensurePmManagesProject(requester, projectName);
    const project = await this.projectsService.findByName(projectName);
    if (!project) {
      throw new NotFoundException(`Project "${projectName}" not found`);
    }
    if (!project.startDate || !project.targetEndDate) {
      throw new BadRequestException(
        'Project must have both a start date and a target end date set before sprints can be generated',
      );
    }
    if (project.startDate >= project.targetEndDate) {
      throw new BadRequestException('Project start date must be before its target end date');
    }

    const existingNumbers = new Set((await this.findAllForProject(projectName)).map((s) => s.sprintNumber));

    const SPRINT_LENGTH_DAYS = 14;
    const end = new Date(`${project.targetEndDate}T00:00:00Z`);
    const toCreate: ProjectSprint[] = [];
    let sprintNumber = 1;
    let cursor = new Date(`${project.startDate}T00:00:00Z`);

    while (cursor < end) {
      const sprintStart = cursor;
      const naturalEnd = new Date(cursor);
      naturalEnd.setUTCDate(naturalEnd.getUTCDate() + (SPRINT_LENGTH_DAYS - 1));
      const sprintEnd = naturalEnd < end ? naturalEnd : end;

      if (!existingNumbers.has(sprintNumber)) {
        toCreate.push(
          this.sprintRepository.create({
            projectName,
            sprintNumber,
            name: `Sprint ${sprintNumber}`,
            startDate: sprintStart.toISOString().slice(0, 10),
            endDate: sprintEnd.toISOString().slice(0, 10),
          }),
        );
      }

      sprintNumber += 1;
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() + SPRINT_LENGTH_DAYS);
    }

    if (toCreate.length > 0) {
      await this.sprintRepository.save(toCreate);
    }

    return this.findAllForProject(projectName);
  }
}
