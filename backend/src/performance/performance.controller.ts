import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PerformanceService } from './performance.service';
import { SnapshotPerformancePeriodDto } from './dto/snapshot-performance-period.dto';
import { SnapshotAllPerformancePeriodDto } from './dto/snapshot-all-performance-period.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('performance')
export class PerformanceController {
  constructor(private readonly performanceService: PerformanceService) {}

  /** Performance Score (Technical Point + Contribution + Certificate points) — the four most recent half-year periods. */
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.performanceService.findRecentPerformanceScoreHistoryForEmployee(user.employeeId, 4);
  }

  @Get('employee/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  findForEmployee(@Param('employeeId') employeeId: string) {
    return this.performanceService.findPerformanceScoreHistoryForEmployee(employeeId);
  }

  /** Freezes one employee's period — defaults to the current period, live-computed unless overridden. Admin-only. */
  @Post('employee/:employeeId/snapshot')
  @Roles(Role.ADMIN)
  snapshotForEmployee(@Param('employeeId') employeeId: string, @Body() dto: SnapshotPerformancePeriodDto) {
    return this.performanceService.snapshotPeriodForEmployee(employeeId, dto);
  }

  /** Closes out one period for every employee at once — e.g. at the end of a half-year. Admin-only. */
  @Post('snapshot-all')
  @Roles(Role.ADMIN)
  snapshotForAllEmployees(@Body() dto: SnapshotAllPerformancePeriodDto) {
    return this.performanceService.snapshotPeriodForAllEmployees(dto);
  }
}
