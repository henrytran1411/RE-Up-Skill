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
import { ContributionSource } from '../../common/enums/contribution-source.enum';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

/**
 * A single, manually-logged contribution/performance point entry — the
 * building block of an employee's "Contribution points, Work Performance &
 * Task Completion" record (CLAUDE.md section 4). Admin-only ledger, never
 * auto-computed: each entry is one fact (a PM evaluation score, a skill
 * verification, a reward, etc.) tagged with its source, aggregated by
 * calendar year for display.
 */
@Entity('contribution_records')
export class ContributionRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.contributionRecords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ type: 'enum', enum: ContributionSource })
  source: ContributionSource;

  /** Points awarded by this entry — may be negative (e.g. a penalty) though that's not the common case. */
  @Column({ type: 'decimal', precision: 8, scale: 2, transformer: DecimalColumnTransformer })
  points: number;

  /** The date this contribution occurred/was earned — used to bucket entries into a calendar year. */
  @Column({ type: 'date' })
  recordDate: string;

  @Column({ type: 'text' })
  description: string;

  /** Admin who logged this entry — loose reference, same style as reviewedById/verifiedById elsewhere. */
  @Column({ type: 'uuid', nullable: true })
  recordedById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
