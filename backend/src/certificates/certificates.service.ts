import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmployeeCertificate } from './entities/employee-certificate.entity';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/decorators/current-user.decorator';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface CertificateYearSummary {
  employeeId: string;
  year: number;
  totalPoints: number;
  certificates: EmployeeCertificate[];
}

@Injectable()
export class CertificatesService {
  constructor(
    @InjectRepository(EmployeeCertificate)
    private readonly certificateRepository: Repository<EmployeeCertificate>,
  ) {}

  async findOne(id: string): Promise<EmployeeCertificate> {
    const certificate = await this.certificateRepository.findOne({ where: { id } });
    if (!certificate) {
      throw new NotFoundException(`Certificate ${id} not found`);
    }
    return certificate;
  }

  create(employeeId: string, dto: CreateCertificateDto): Promise<EmployeeCertificate> {
    const certificate = this.certificateRepository.create({ ...dto, employeeId });
    return this.certificateRepository.save(certificate);
  }

  /**
   * Owner may edit their own certificate only while it hasn't been verified
   * yet. Admin may edit any certificate at any time — management oversight,
   * separate from the one-time `verify` action which is the only way points
   * ever get set.
   */
  async update(id: string, requester: AuthenticatedUser, dto: UpdateCertificateDto): Promise<EmployeeCertificate> {
    const certificate = await this.findOne(id);
    if (requester.role !== Role.ADMIN) {
      if (certificate.employeeId !== requester.employeeId) {
        throw new ForbiddenException('You can only edit your own certificates');
      }
      if (certificate.isVerified) {
        throw new BadRequestException('Cannot edit a certificate that has already been verified');
      }
    }
    Object.assign(certificate, dto);
    return this.certificateRepository.save(certificate);
  }

  /** Owner may delete their own certificate only while it hasn't been verified yet. Admin may delete any certificate. */
  async remove(id: string, requester: AuthenticatedUser): Promise<void> {
    const certificate = await this.findOne(id);
    if (requester.role !== Role.ADMIN) {
      if (certificate.employeeId !== requester.employeeId) {
        throw new ForbiddenException('You can only delete your own certificates');
      }
      if (certificate.isVerified) {
        throw new BadRequestException('Cannot delete a certificate that has already been verified');
      }
    }
    await this.certificateRepository.remove(certificate);
  }

  /** Admin-only: turns a self-declared claim into a scored fact. Can only happen once. */
  async verify(id: string, verifierId: string, points: number): Promise<EmployeeCertificate> {
    const certificate = await this.findOne(id);
    if (certificate.isVerified) {
      throw new BadRequestException('This certificate has already been verified');
    }
    certificate.isVerified = true;
    certificate.points = points;
    certificate.verifiedById = verifierId;
    certificate.verifiedAt = new Date();
    return this.certificateRepository.save(certificate);
  }

  findForEmployee(employeeId: string): Promise<EmployeeCertificate[]> {
    return this.certificateRepository.find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Every certificate across every employee — the admin management table. */
  findAll(): Promise<EmployeeCertificate[]> {
    return this.certificateRepository.find({
      relations: ['employee'],
      order: { createdAt: 'DESC' },
    });
  }

  /** Awaiting Admin action, oldest first — what the verify queue should work through. */
  findPending(): Promise<EmployeeCertificate[]> {
    return this.certificateRepository.find({
      where: { isVerified: false },
      relations: ['employee'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * One summary per calendar year the employee has VERIFIED certificates in
   * (unverified ones are worth nothing, so they're excluded), bucketed by
   * the year they were verified — that's when the points actually landed.
   */
  async findYearlySummaryForEmployee(employeeId: string): Promise<CertificateYearSummary[]> {
    const certificates = await this.certificateRepository.find({
      where: { employeeId, isVerified: true },
      order: { verifiedAt: 'DESC' },
    });

    const byYear = new Map<number, EmployeeCertificate[]>();
    for (const certificate of certificates) {
      const year = certificate.verifiedAt!.getFullYear();
      const list = byYear.get(year) ?? [];
      list.push(certificate);
      byYear.set(year, list);
    }

    return Array.from(byYear.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, yearCertificates]) => ({
        employeeId,
        year,
        totalPoints: round2(yearCertificates.reduce((sum, c) => sum + Number(c.points ?? 0), 0)),
        certificates: yearCertificates,
      }));
  }

  /**
   * The `count` most recent calendar years up to and including this one,
   * always present even with zero certificates — so the employee's own
   * dashboard always shows exactly `count` years instead of however many
   * happen to have a verified certificate.
   */
  async findRecentYearlySummaryForEmployee(employeeId: string, count = 4): Promise<CertificateYearSummary[]> {
    const certificates = await this.certificateRepository.find({
      where: { employeeId, isVerified: true },
      order: { verifiedAt: 'DESC' },
    });

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: count }, (_, i) => currentYear - (count - 1 - i));

    return years.map((year) => {
      const yearCertificates = certificates.filter((c) => c.verifiedAt!.getFullYear() === year);
      return {
        employeeId,
        year,
        totalPoints: round2(yearCertificates.reduce((sum, c) => sum + Number(c.points ?? 0), 0)),
        certificates: yearCertificates,
      };
    });
  }
}
