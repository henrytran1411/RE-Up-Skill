import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeesService } from '../employees/employees.service';
import { LoginDto } from './dto/login.dto';
import { MicrosoftProfile } from './strategies/microsoft.strategy';
import { today } from '../common/utils/date.util';

@Injectable()
export class AuthService {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly jwtService: JwtService,
  ) {}

  private buildLoginResponse(employee: Employee) {
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

  async login(dto: LoginDto) {
    const employee = await this.employeesService.findByEmailWithPassword(dto.email);
    if (!employee || !employee.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, employee.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.buildLoginResponse(employee);
  }

  /**
   * Finds the employee matching the Microsoft account's email, or creates
   * one on the spot (Junior developer, starting today) if this is their
   * first sign-in — self-service provisioning via a trusted Microsoft
   * identity rather than an HR-created account. The generated password is
   * random and never surfaced; this employee only ever signs in via Microsoft.
   */
  async loginWithMicrosoftProfile(profile: MicrosoftProfile) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException('Your Microsoft account has no email address we can sign in with.');
    }

    let employee = await this.employeesService.findByEmailWithPassword(email);
    if (!employee) {
      const joinDate = today();
      employee = await this.employeesService.create({
        fullName: profile.displayName?.trim() || email,
        email,
        password: randomBytes(24).toString('hex'),
        level: 'Junior',
        levelEffectiveDate: joinDate,
        joinDate,
      });
    }

    if (!employee.isActive) {
      throw new UnauthorizedException('This account has been deactivated.');
    }

    return this.buildLoginResponse(employee);
  }
}
