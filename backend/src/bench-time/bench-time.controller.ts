import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { BenchTimeService } from './bench-time.service';
import { CreateBenchLogDto } from './dto/create-bench-log.dto';
import { ReviewBenchLogDto } from './dto/review-bench-log.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('bench-logs')
export class BenchTimeController {
  constructor(private readonly benchTimeService: BenchTimeService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBenchLogDto) {
    return this.benchTimeService.create(user.employeeId, dto);
  }

  /** PM logs bench activity on behalf of another employee (e.g. backfilling known bench time). */
  @Post('employees/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  createForEmployee(@Param('employeeId') employeeId: string, @Body() dto: CreateBenchLogDto) {
    return this.benchTimeService.create(employeeId, dto);
  }

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.benchTimeService.findForEmployee(user.employeeId);
  }

  /** Self-facing "you're idle and not learning anything" warning — null when there's nothing to flag. */
  @Get('me/idle-learning-alert')
  findMyIdleLearningAlert(@CurrentUser() user: AuthenticatedUser) {
    return this.benchTimeService.findIdleLearningAlertForEmployee(user.employeeId);
  }

  @Get('employee/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  findForEmployee(@Param('employeeId') employeeId: string) {
    return this.benchTimeService.findForEmployee(employeeId);
  }

  @Get('alerts/idle')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  findIdleAlerts() {
    return this.benchTimeService.findIdleBenchAlerts();
  }

  @Patch(':id/review')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  review(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewBenchLogDto,
  ) {
    return this.benchTimeService.review(id, user.employeeId, dto);
  }
}
