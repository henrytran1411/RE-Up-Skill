import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectSprintsService } from './project-sprints.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpsertProjectDto } from './dto/upsert-project.dto';
import { CreateProjectSprintDto } from './dto/create-project-sprint.dto';
import { UpdateProjectSprintDto } from './dto/update-project-sprint.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectSprintsService: ProjectSprintsService,
  ) {}

  /** Stand up a new project record — HR/Admin only. Doesn't require any tasks to exist yet. */
  @Post()
  @Roles(Role.HR, Role.ADMIN)
  createProject(@Body() dto: CreateProjectDto) {
    return this.projectsService.createProject(dto);
  }

  /**
   * Rename a project and/or set its revenue and/or assign its manager —
   * HR/Admin only. Deliberately excludes PM: they don't set the revenue
   * whose resulting ROI they're not allowed to see.
   */
  @Put(':name')
  @Roles(Role.HR, Role.ADMIN)
  upsertProject(@Param('name') name: string, @Body() dto: UpsertProjectDto) {
    return this.projectsService.upsertProject(name, dto);
  }

  /** Admin-only, same as employee deletion. Blocked while task records still reference this project. */
  @Delete(':name')
  @Roles(Role.ADMIN)
  deleteProject(@Param('name') name: string) {
    return this.projectsService.deleteProject(name);
  }

  /** Sprints defined for one project — used to populate the Sprint assignment dropdown on each task, and the health check's burndown chart. */
  @Get(':name/sprints')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  listSprints(@Param('name') name: string) {
    return this.projectSprintsService.findAllForProject(name);
  }

  /** A PM may only add sprints to a project they manage. */
  @Post(':name/sprints')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  createSprint(@Param('name') name: string, @Body() dto: CreateProjectSprintDto, @CurrentUser() user: AuthenticatedUser) {
    return this.projectSprintsService.create(name, dto, user);
  }

  /** Bulk-fills sequential 2-week sprints from the project's startDate through targetEndDate, skipping sprint numbers that already exist. */
  @Post(':name/sprints/generate')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  generateSprints(@Param('name') name: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectSprintsService.generate(name, user);
  }

  @Patch(':name/sprints/:id')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  updateSprint(
    @Param('name') name: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectSprintDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projectSprintsService.update(name, id, dto, user);
  }

  /** Blocked while any task in this project is still assigned to this sprint. */
  @Delete(':name/sprints/:id')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  deleteSprint(@Param('name') name: string, @Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectSprintsService.remove(name, id, user);
  }
}
