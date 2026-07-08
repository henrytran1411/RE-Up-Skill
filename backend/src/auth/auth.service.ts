import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { EmployeesService } from '../employees/employees.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const employee = await this.employeesService.findByEmailWithPassword(dto.email);
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, employee.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: employee.id, email: employee.email, role: employee.role };

    return {
      accessToken: this.jwtService.sign(payload),
      employee: {
        id: employee.id,
        fullName: employee.fullName,
        email: employee.email,
        role: employee.role,
        level: employee.level,
      },
    };
  }
}
