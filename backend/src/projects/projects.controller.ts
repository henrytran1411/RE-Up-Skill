import { Body, Controller, Delete, Param, Post, Put } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpsertProjectDto } from './dto/upsert-project.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

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
}
