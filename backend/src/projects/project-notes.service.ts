import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectNote } from './entities/project-note.entity';
import { ProjectsService } from './projects.service';
import { CreateProjectNoteDto } from './dto/create-project-note.dto';
import { UpdateProjectNoteDto } from './dto/update-project-note.dto';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ProjectNotesService {
  constructor(
    @InjectRepository(ProjectNote)
    private readonly noteRepository: Repository<ProjectNote>,
    private readonly projectsService: ProjectsService,
  ) {}

  /** PM may only manage notes for a project they're the assigned manager of; other mutating roles are unrestricted. */
  private async ensurePmManagesProject(requester: AuthenticatedUser, projectName: string): Promise<void> {
    if (requester.role !== Role.PM) {
      return;
    }
    const project = await this.projectsService.findByName(projectName);
    if (project?.managerId !== requester.employeeId) {
      throw new ForbiddenException('You can only manage notes for projects you manage');
    }
  }

  findAllForProject(projectName: string): Promise<ProjectNote[]> {
    return this.noteRepository.find({
      where: { projectName },
      relations: ['author'],
      order: { createdAt: 'DESC' },
    });
  }

  private async findOneOrFail(projectName: string, id: string): Promise<ProjectNote> {
    const note = await this.noteRepository.findOne({ where: { id, projectName }, relations: ['author'] });
    if (!note) {
      throw new NotFoundException(`Note ${id} not found for project "${projectName}"`);
    }
    return note;
  }

  /** Only the note's own author, or an Admin, may edit/delete it — other PMs/Tech Leads managing the same project can't rewrite someone else's journal entry. */
  private ensureAuthorOrAdmin(note: ProjectNote, requester: AuthenticatedUser): void {
    if (note.authorId !== requester.employeeId && requester.role !== Role.ADMIN) {
      throw new ForbiddenException('You can only edit or delete your own notes');
    }
  }

  async create(projectName: string, dto: CreateProjectNoteDto, requester: AuthenticatedUser): Promise<ProjectNote> {
    await this.ensurePmManagesProject(requester, projectName);
    const note = this.noteRepository.create({ projectName, content: dto.content, authorId: requester.employeeId });
    const saved = await this.noteRepository.save(note);
    return this.findOneOrFail(projectName, saved.id);
  }

  async update(
    projectName: string,
    id: string,
    dto: UpdateProjectNoteDto,
    requester: AuthenticatedUser,
  ): Promise<ProjectNote> {
    await this.ensurePmManagesProject(requester, projectName);
    const note = await this.findOneOrFail(projectName, id);
    this.ensureAuthorOrAdmin(note, requester);
    await this.noteRepository.update(id, dto);
    return this.findOneOrFail(projectName, id);
  }

  async remove(projectName: string, id: string, requester: AuthenticatedUser): Promise<void> {
    await this.ensurePmManagesProject(requester, projectName);
    const note = await this.findOneOrFail(projectName, id);
    this.ensureAuthorOrAdmin(note, requester);
    await this.noteRepository.remove(note);
  }
}
