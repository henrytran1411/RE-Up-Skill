import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { BackfillLevelHistoryDto } from './dto/backfill-level-history.dto';
import { FindEmployeesQueryDto } from './dto/find-employees-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(dto);
  }

  @Get()
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findAll(@Query() query: FindEmployeesQueryDto) {
    return this.employeesService.findAll(query);
  }

  @Get('me')
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.findOne(user.employeeId);
  }

  /** Junior -> Middle -> Senior timeline for the logged-in employee. */
  @Get('me/level-history')
  findMyLevelHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.employeesService.findLevelHistory(user.employeeId);
  }

  @Get(':id')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  /** Junior -> Middle -> Senior timeline, with days spent at each level. */
  @Get(':id/level-history')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  findLevelHistory(@Param('id') id: string) {
    return this.employeesService.findLevelHistory(id);
  }

  /** Admin-only cleanup of a single ledger row — this history is otherwise append-only. */
  @Delete(':id/level-history/:historyId')
  @Roles(Role.ADMIN)
  deleteLevelHistoryEntry(@Param('id') id: string, @Param('historyId') historyId: string) {
    return this.employeesService.deleteLevelHistoryEntry(id, historyId);
  }

  /** Backfills a historical predecessor level, ending right when the earliest existing record begins. */
  @Post(':id/level-history/backfill')
  @Roles(Role.ADMIN)
  backfillLevelHistory(@Param('id') id: string, @Body() dto: BackfillLevelHistoryDto) {
    return this.employeesService.backfillLevelHistory(id, dto.level, dto.startDate);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.employeesService.update(id, dto, user.employeeId);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }
}
