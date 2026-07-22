import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Admin-managed catalog of overall employee career levels (e.g. Junior /
 * Middle / Senior). Distinct from SkillLevel, which weights per-skill
 * proficiency for scoring (CLAUDE.md §4.2) — this one is purely a name
 * catalog for Employee.level, a free-text column matched against these
 * names rather than an FK.
 */
@Entity('employee_levels')
export class EmployeeLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  name: string;

  /** Display/ranking order — lower sorts first (e.g. Junior=1, Middle=2, Senior=3). */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
