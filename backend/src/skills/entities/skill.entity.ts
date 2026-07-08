import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';
import { CompanyNeedLevel } from '../../common/enums/company-need-level.enum';

@Entity('skills')
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category: string | null;

  /**
   * Key skills (e.g. English) receive a score multiplier under
   * the "Kỹ năng Mềm & Tiếng Anh" weighting bucket.
   */
  @Column({ default: false })
  isKeySkill: boolean;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0, transformer: DecimalColumnTransformer })
  keySkillMultiplier: number;

  /** How much the company currently needs this skill. */
  @Column({ type: 'enum', enum: CompanyNeedLevel, default: CompanyNeedLevel.NORMALLY })
  companyNeedLevel: CompanyNeedLevel;

  /** A fundamental/prerequisite skill (e.g. Git, SQL basics) rather than a specialization. */
  @Column({ default: false })
  isFoundational: boolean;
}
