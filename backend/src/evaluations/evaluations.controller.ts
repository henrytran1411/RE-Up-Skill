import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { EvaluationsService } from './evaluations.service';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post('run')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  run(@Body() dto: CreateEvaluationDto) {
    return this.evaluationsService.runEvaluation(dto);
  }

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.evaluationsService.findForEmployee(user.employeeId);
  }

  @Get('employee/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.HR, Role.ADMIN)
  findForEmployee(@Param('employeeId') employeeId: string) {
    return this.evaluationsService.findForEmployee(employeeId);
  }

  @Patch(':id/finalize')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  finalize(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { notes?: string },
  ) {
    return this.evaluationsService.finalize(id, user.employeeId, body.notes);
  }
}
