import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

/**
 * Master list of skill proficiency levels (e.g. Junior/Middle/Senior/Expert/
 * Master) and the weight point each carries when scoring an employee's
 * skill-score bucket (CLAUDE.md §4.2). Distinct from `EmployeeLevel`
 * (Employee.level / EmployeeSkill.level), which tracks career/job level —
 * this is a separate, admin-managed weighting table for skill scoring.
 */
@Entity('skill_levels')
export class SkillLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  name: string;

  /** Weight point applied when scoring an employee's skill held at this level. */
  @Column({ type: 'decimal', precision: 6, scale: 2, transformer: DecimalColumnTransformer })
  weight: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
