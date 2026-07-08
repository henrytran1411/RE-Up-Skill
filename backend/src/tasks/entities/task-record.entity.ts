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

@Entity('task_records')
export class TaskRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.tasks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @Column({ length: 150 })
  projectName: string;

  @Column({ length: 200 })
  taskName: string;

  @Column({ type: 'decimal', precision: 6, scale: 2, transformer: DecimalColumnTransformer })
  estimateHours: number;

  @Column({ type: 'decimal', precision: 6, scale: 2, nullable: true, transformer: DecimalColumnTransformer })
  actualHours: number | null;

  /** Task complexity, 1 (trivial) - 5 (highly complex). */
  @Column({ type: 'int', default: 1 })
  complexity: number;

  /**
   * Agile-style effort/story points for this task. Used to compute an
   * employee's effort share of a project: their points on that project
   * divided by the project's total points across every contributor.
   */
  @Column({ type: 'int', default: 1 })
  points: number;

  /** PM rating of quality/delivery, 1-5. */
  @Column({ type: 'int', nullable: true })
  pmRating: number | null;

  @Column({ type: 'int', default: 0 })
  bugCount: number;

  @Column({ type: 'date', nullable: true })
  completedAt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
