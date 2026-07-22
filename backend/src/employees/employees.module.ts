import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from './entities/employee.entity';
import { EmployeeLevelHistory } from './entities/employee-level-history.entity';
import { EmployeeLevel } from './entities/employee-level.entity';
import { EmployeeRole } from './entities/employee-role.entity';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeLevelsService } from './employee-levels.service';
import { EmployeeLevelsController } from './employee-levels.controller';
import { EmployeeRolesService } from './employee-roles.service';
import { EmployeeRolesController } from './employee-roles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Employee, EmployeeLevelHistory, EmployeeLevel, EmployeeRole])],
  controllers: [EmployeesController, EmployeeLevelsController, EmployeeRolesController],
  providers: [EmployeesService, EmployeeLevelsService, EmployeeRolesService],
  exports: [EmployeesService, EmployeeLevelsService, EmployeeRolesService],
})
export class EmployeesModule {}
