import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

/**
 * Master list of skill categories (e.g. "Frontend", "Backend", "Soft Skill").
 * `Skill.category` stores the category name as free text rather than an FK —
 * same loose-reference style as Project/TaskRecord.projectName — so renaming
 * a category here cascades to every Skill row referencing the old name (see
 * SkillCategoriesService#update).
 */
@Entity('skill_categories')
export class SkillCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /**
   * Score weight applied to an employee's PRIMARY skill in this category
   * (see EmployeeSkill.isPrimary) when computing the skill-score bucket of
   * the evaluation formula (CLAUDE.md §4.2). E.g. Backend primary = 1.0.
   */
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1, transformer: DecimalColumnTransformer })
  primaryWeight: number;

  /**
   * Score weight applied to every OTHER (non-primary) skill an employee
   * holds in this category — breadth counts, but less than the flagship
   * skill. E.g. Backend non-primary = 0.2.
   */
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.2, transformer: DecimalColumnTransformer })
  secondaryWeight: number;

  /** How urgently employees with no skill here should be steered toward learning one — 1 (low) to 4 (highest). */
  @Column({ type: 'int', default: 1 })
  priority: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
