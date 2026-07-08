import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(150)
  name: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  revenue?: number;

  /** The employee (PM) responsible for this project — scopes their view on the Projects page. */
  @IsUUID()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
