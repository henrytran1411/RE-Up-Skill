import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CompanyNeedLevel } from '../../common/enums/company-need-level.enum';

export class CreateSkillDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsBoolean()
  @IsOptional()
  isKeySkill?: boolean;

  @IsNumber()
  @IsOptional()
  keySkillMultiplier?: number;

  /** How much the company currently needs this skill. */
  @IsEnum(CompanyNeedLevel)
  @IsOptional()
  companyNeedLevel?: CompanyNeedLevel;

  /** A fundamental/prerequisite skill rather than a specialization. */
  @IsBoolean()
  @IsOptional()
  isFoundational?: boolean;
}
