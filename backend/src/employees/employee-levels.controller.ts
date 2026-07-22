import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { EmployeeLevelsService } from './employee-levels.service';
import { CreateEmployeeLevelDto } from './dto/create-employee-level.dto';
import { UpdateEmployeeLevelDto } from './dto/update-employee-level.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('employee-levels')
export class EmployeeLevelsController {
  constructor(private readonly employeeLevelsService: EmployeeLevelsService) {}

  @Post()
  @Roles(Role.HR, Role.ADMIN)
  create(@Body() dto: CreateEmployeeLevelDto) {
    return this.employeeLevelsService.create(dto);
  }

  @Get()
  findAll() {
    return this.employeeLevelsService.findAll();
  }

  @Patch(':id')
  @Roles(Role.HR, Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeLevelDto) {
    return this.employeeLevelsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.HR, Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.employeeLevelsService.remove(id);
  }
}
