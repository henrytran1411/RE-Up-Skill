import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ContributionService } from './contribution.service';
import { CreateContributionRecordDto } from './dto/create-contribution-record.dto';
import { UpdateContributionRecordDto } from './dto/update-contribution-record.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('contribution-records')
export class ContributionController {
  constructor(private readonly contributionService: ContributionService) {}

  /** Logs one point entry — Admin only, the only way this ledger is ever written to. */
  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateContributionRecordDto, @CurrentUser() user: AuthenticatedUser) {
    return this.contributionService.create(dto, user.employeeId);
  }

  /** Every entry across every employee — the admin management table's default view. */
  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.contributionService.findAll();
  }

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.contributionService.findForEmployee(user.employeeId);
  }

  /** One entry per calendar year, with a per-source breakdown — feeds the employee dashboard's chart. */
  @Get('me/yearly')
  findMyYearlySummary(@CurrentUser() user: AuthenticatedUser) {
    return this.contributionService.findYearlySummaryForEmployee(user.employeeId);
  }

  @Get('employee/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findForEmployee(@Param('employeeId') employeeId: string) {
    return this.contributionService.findForEmployee(employeeId);
  }

  @Get('employee/:employeeId/yearly')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findYearlySummaryForEmployee(@Param('employeeId') employeeId: string) {
    return this.contributionService.findYearlySummaryForEmployee(employeeId);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateContributionRecordDto) {
    return this.contributionService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.contributionService.remove(id);
  }
}
