import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { EmployeeRolesService } from './employee-roles.service';
import { CreateEmployeeRoleDto } from './dto/create-employee-role.dto';
import { UpdateEmployeeRoleDto } from './dto/update-employee-role.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('employee-roles')
export class EmployeeRolesController {
  constructor(private readonly employeeRolesService: EmployeeRolesService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateEmployeeRoleDto) {
    return this.employeeRolesService.create(dto);
  }

  @Get()
  findAll() {
    return this.employeeRolesService.findAll();
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeRoleDto) {
    return this.employeeRolesService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@Param('id') id: string) {
    return this.employeeRolesService.remove(id);
  }
}
