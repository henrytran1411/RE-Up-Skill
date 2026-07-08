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
import { BenchActivityType } from '../../common/enums/bench-activity-type.enum';

@Entity('bench_logs')
export class BenchLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.benchLogs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'enum', enum: BenchActivityType })
  activityType: BenchActivityType;

  @Column({ type: 'text' })
  description: string;

  /**
   * 1-5 outcome rating set by PM/Tech Lead. Passive activities (e.g. reading
   * docs) should score lower than active output (e.g. shipping an internal
   * tool) per the business rules in CLAUDE.md section 4.2.
   */
  @Column({ type: 'int', nullable: true })
  outcomeScore: number | null;

  @Column({ default: false })
  isReviewed: boolean;

  @Column({ type: 'uuid', nullable: true })
  reviewedById: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
