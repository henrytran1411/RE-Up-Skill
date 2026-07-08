import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

/**
 * A certificate an employee has declared for themselves. Worth zero points
 * until an Admin verifies it — verification is what turns a self-declared
 * claim into a scored fact, same spirit as EmployeeSkill's CONFIRMED status.
 */
@Entity('employee_certificates')
export class EmployeeCertificate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.certificates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Relative URL under /api/uploads — see CertificatesController#uploadImage. */
  @Column()
  imageUrl: string;

  @Column({ type: 'date' })
  expiredDate: string;

  /** Set only by Admin at verification time — null (worth nothing) until then. */
  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true, transformer: DecimalColumnTransformer })
  points: number | null;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'uuid', nullable: true })
  verifiedById: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
