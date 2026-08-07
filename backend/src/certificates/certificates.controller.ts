import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';
import { certificateMulterOptions } from './certificate-upload.config';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  /** Uploads the certificate image, returns the URL to pass as `imageUrl` on create/update. */
  @Post('upload')
  @UseInterceptors(FileInterceptor('image', certificateMulterOptions))
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('An image file is required');
    }
    return { imageUrl: `/api/uploads/certificates/${file.filename}` };
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCertificateDto) {
    return this.certificatesService.create(user.employeeId, dto);
  }

  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.certificatesService.findForEmployee(user.employeeId);
  }

  /** One entry per calendar year of verified certificates — feeds the employee dashboard's chart. */
  @Get('me/yearly')
  findMyYearlySummary(@CurrentUser() user: AuthenticatedUser) {
    return this.certificatesService.findYearlySummaryForEmployee(user.employeeId);
  }

  /** The four most recent calendar years, always present even with zero certificates — feeds the employee dashboard's chart. */
  @Get('me/recent-yearly')
  findMyRecentYearlySummary(@CurrentUser() user: AuthenticatedUser) {
    return this.certificatesService.findRecentYearlySummaryForEmployee(user.employeeId, 4);
  }

  /** Awaiting verification, across every employee — Admin's review queue. */
  @Get('pending')
  @Roles(Role.ADMIN)
  findPending() {
    return this.certificatesService.findPending();
  }

  /** Every certificate across every employee — the admin management table. */
  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.certificatesService.findAll();
  }

  @Get('employee/:employeeId')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  findForEmployee(@Param('employeeId') employeeId: string) {
    return this.certificatesService.findForEmployee(employeeId);
  }

  @Get('employee/:employeeId/yearly')
  @Roles(Role.PM, Role.TECH_LEAD, Role.ADMIN)
  findYearlySummaryForEmployee(@Param('employeeId') employeeId: string) {
    return this.certificatesService.findYearlySummaryForEmployee(employeeId);
  }

  /** Owner-only while unverified, or Admin at any time — see CertificatesService#update. */
  @Patch(':id')
  update(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateCertificateDto) {
    return this.certificatesService.update(id, user, dto);
  }

  /** Admin-only: assigns points and marks the certificate verified. One-time action. */
  @Patch(':id/verify')
  @Roles(Role.ADMIN)
  verify(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyCertificateDto) {
    return this.certificatesService.verify(id, user.employeeId, dto.points);
  }

  /** Owner-only while unverified, or Admin at any time — see CertificatesService#remove. */
  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.certificatesService.remove(id, user);
  }
}
