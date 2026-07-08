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
import { EvaluationPeriod, EvaluationStatus } from '../../common/enums/evaluation-period.enum';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

/**
 * One row per employee per evaluation cycle. Score fields are 0-100 sub-scores
 * per CLAUDE.md section 4.2; `totalScore` is the weighted sum using the level's
 * weight profile (see evaluations/scoring/weight-profiles.ts).
 */
@Entity('evaluations')
export class Evaluation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.evaluations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ type: 'enum', enum: EvaluationPeriod })
  period: EvaluationPeriod;

  @Column({ type: 'date' })
  periodStart: string;

  @Column({ type: 'date' })
  periodEnd: string;

  /**
   * Level(s) held during the period, with the fraction of the period spent at
   * each level. Used to pro-rate the weight profile when a dev changes level
   * mid-cycle. e.g. [{ level: 'junior', fraction: 0.4 }, { level: 'middle', fraction: 0.6 }]
   */
  @Column({ type: 'jsonb' })
  levelBreakdown: { level: string; fraction: number }[];

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: DecimalColumnTransformer })
  taskScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: DecimalColumnTransformer })
  skillScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: DecimalColumnTransformer })
  softSkillScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: DecimalColumnTransformer })
  benchScore: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: DecimalColumnTransformer })
  totalScore: number;

  @Column({ type: 'enum', enum: EvaluationStatus, default: EvaluationStatus.DRAFT })
  status: EvaluationStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewerId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
