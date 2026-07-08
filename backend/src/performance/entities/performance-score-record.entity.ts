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

export enum PerformancePeriodHalf {
  H1 = 'H1',
  H2 = 'H2',
}

/**
 * A frozen Performance Score snapshot for one employee, one half-year period
 * (Jan-Jun or Jul-Dec). Unlike Technical Point — a live, undated value — this
 * ledger captures what it WAS at snapshot time, so plotting these rows over
 * successive periods shows genuine change over time rather than the same
 * current number repeated everywhere. Once written, a period's values don't
 * drift just because the live source data (skills, contributions,
 * certificates) changes later — see PerformanceService#snapshotPeriodForEmployee.
 */
@Entity('performance_score_records')
@Unique(['employeeId', 'year', 'half'])
export class PerformanceScoreRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'enum', enum: PerformancePeriodHalf })
  half: PerformancePeriodHalf;

  @Column({ type: 'decimal', precision: 8, scale: 2, transformer: DecimalColumnTransformer })
  technicalPoint: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, transformer: DecimalColumnTransformer })
  contributionPoints: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, transformer: DecimalColumnTransformer })
  certificatePoints: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, transformer: DecimalColumnTransformer })
  totalScore: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
