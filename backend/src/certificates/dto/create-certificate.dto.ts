import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCertificateDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  /** Set from the response of POST /certificates/upload — never a raw file in this DTO. */
  @IsString()
  imageUrl: string;

  @IsDateString()
  expiredDate: string;
}
