import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Admin-managed catalog of roles assignable to an employee (see
 * Employee.role, a free-text column matched against this catalog's names
 * rather than an FK). Note: this does NOT drive real authorization — the
 * backend's @Roles(...) permission checks throughout the app stay hardcoded
 * to the 5 canonical role strings ('developer'/'tech_lead'/'pm'/'hr'/
 * 'admin'). Renaming or deleting one of those here breaks that person's
 * real permissions; adding a brand-new role name grants no permissions
 * anywhere until matching @Roles(...) code is written.
 */
@Entity('employee_roles')
export class EmployeeRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 50 })
  name: string;

  /** Display/ranking order — lower sorts first. */
  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
