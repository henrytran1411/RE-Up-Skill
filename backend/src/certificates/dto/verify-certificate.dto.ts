import { IsNumber, Min } from 'class-validator';

export class VerifyCertificateDto {
  /** How many points this certificate is worth — Admin's call, made at verification time. */
  @IsNumber()
  @Min(0)
  points: number;
}
