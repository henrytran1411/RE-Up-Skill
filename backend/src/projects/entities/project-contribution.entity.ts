import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

/**
 * An employee's costing rate for one specific project — replaces the old
 * single global Employee.monthlySalary, since the same person can be
 * costed differently across engagements (e.g. contractor vs FTE rate, or a
 * raise mid-project that shouldn't retroactively change a finished
 * project's ROI). Absence of a row means "no rate on file for this
 * project", the same semantics the old nullable Employee.monthlySalary
 * had. Matched to Project.name the same loose, non-FK way
 * TaskRecord.projectName is.
 */
@Entity('project_contributions')
@Unique(['employeeId', 'projectName'])
export class ProjectContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.projectContributions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ length: 150 })
  projectName: string;

  /**
   * Sensitive compensation data — excluded from normal queries (like
   * passwordHash) and only ever fetched via explicit addSelect for HR/Admin
   * or internal ROI math. Manually entered for now; will be auto-calculated
   * (e.g. from hours worked) in a later pass.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, select: false, transformer: DecimalColumnTransformer })
  totalSalary: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
