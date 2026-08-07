import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { DeclareEmployeeSkillDto } from './dto/declare-employee-skill.dto';
import { UpdateEmployeeSkillDto } from './dto/update-employee-skill.dto';
import { FindEmployeeSkillsQueryDto } from './dto/find-employee-skills-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  createSkill(@Body() dto: CreateSkillDto) {
    return this.skillsService.createSkill(dto);
  }

  /**
   * Edit/delete the skill catalog itself (master data: name, category, key
   * skill, company-signature, foundational). Nested under `catalog/` rather
   * than `PATCH /skills/:id` because `:employeeSkillId`-shaped routes below
   * already occupy that exact one-segment shape for skill-history entries.
   */
  @Patch('catalog/:id')
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  updateSkill(@Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.skillsService.updateSkill(id, dto);
  }

  @Delete('catalog/:id')
  @Roles(Role.ADMIN, Role.TECH_LEAD)
  deleteSkill(@Param('id') id: string) {
    return this.skillsService.deleteSkill(id);
  }

  @Get()
  findAllSkills() {
    return this.skillsService.findAllSkills();
  }

  @Get('matrix/me')
  findMyMatrix(@CurrentUser() user: AuthenticatedUser) {
    return this.skillsService.findMatrixForEmployee(user.employeeId);
  }

  @Get('matrix/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findMatrixForEmployee(@Param('employeeId') employeeId: string) {
    return this.skillsService.findMatrixForEmployee(employeeId);
  }

  /** Technical point (T = A + B + C) for every employee — for management/dashboard views. */
  @Get('technical-point')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findAllTechnicalPoints() {
    return this.skillsService.findAllTechnicalPoints();
  }

  @Get('technical-point/me')
  findMyTechnicalPoint(@CurrentUser() user: AuthenticatedUser) {
    return this.skillsService.findTechnicalPointForEmployee(user.employeeId);
  }

  @Get('technical-point/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findTechnicalPointForEmployee(@Param('employeeId') employeeId: string) {
    return this.skillsService.findTechnicalPointForEmployee(employeeId);
  }

  /** Categories with zero skill history, sorted by priority high to low — "learn something here next." */
  @Get('suggestions/me')
  findMyLearningSuggestions(@CurrentUser() user: AuthenticatedUser) {
    return this.skillsService.findLearningSuggestionsForEmployee(user.employeeId);
  }

  @Get('suggestions/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findLearningSuggestionsForEmployee(@Param('employeeId') employeeId: string) {
    return this.skillsService.findLearningSuggestionsForEmployee(employeeId);
  }

  @Get('pending')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findPendingReviews() {
    return this.skillsService.findPendingReviews();
  }

  /** Full search/filter across every employee's skill history, for management views. */
  @Get('history')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findHistory(@Query() query: FindEmployeeSkillsQueryDto) {
    return this.skillsService.findHistory(query);
  }

  @Post('declare')
  declareSkill(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeclareEmployeeSkillDto,
  ) {
    return this.skillsService.declareSkill(user.employeeId, dto);
  }

  /** PM adds a skill-history entry on behalf of another employee (e.g. backfilling from a resume). */
  @Post('employees/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  declareForEmployee(
    @Param('employeeId') employeeId: string,
    @Body() dto: DeclareEmployeeSkillDto,
  ) {
    return this.skillsService.declareSkill(employeeId, dto);
  }

  @Patch(':employeeSkillId/verify')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  verifySkill(
    @Param('employeeSkillId') employeeSkillId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.skillsService.verifySkill(employeeSkillId, user.employeeId);
  }

  @Patch(':employeeSkillId/confirm')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  confirmSkill(
    @Param('employeeSkillId') employeeSkillId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.skillsService.confirmSkill(employeeSkillId, user.employeeId);
  }

  /** Owner may set their own skill primary; PM/HR/Tech Lead/Admin may set anyone's. */
  @Patch(':employeeSkillId/primary')
  setPrimarySkill(
    @Param('employeeSkillId') employeeSkillId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.skillsService.setPrimarySkill(employeeSkillId, user);
  }

  @Patch(':employeeSkillId/progress')
  updateProgress(
    @Param('employeeSkillId') employeeSkillId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { progressPercent: number; proficiency?: number },
  ) {
    return this.skillsService.updateProgress(
      employeeSkillId,
      user.employeeId,
      body.progressPercent,
      body.proficiency,
    );
  }

  /** Owner may edit their own entry while unreviewed; PM/HR/Tech Lead/Admin may edit any entry. */
  @Patch(':employeeSkillId')
  updateEmployeeSkill(
    @Param('employeeSkillId') employeeSkillId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateEmployeeSkillDto,
  ) {
    return this.skillsService.updateEmployeeSkill(employeeSkillId, user, dto);
  }

  /** Owner may delete their own entry only while at status START; managers may delete any entry. */
  @Delete(':employeeSkillId')
  deleteEmployeeSkill(
    @Param('employeeSkillId') employeeSkillId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.skillsService.deleteEmployeeSkill(employeeSkillId, user);
  }
}
