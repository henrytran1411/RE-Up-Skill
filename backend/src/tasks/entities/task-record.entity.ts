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
import { JsonArrayColumnTransformer } from '../../common/transformers/json-array.transformer';

/** One Jira issue (usually a Bug) that blocks a task, captured from Jira's "is blocked by" issue links. */
export interface BlockedByIssueRef {
  key: string;
  summary: string | null;
  issueType: string | null;
}

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

  /** The Jira issue key (e.g. "ABC-123") this task was synced from — null for tasks created directly in this system. Unique so re-syncing updates rather than duplicates. */
  @Column({ type: 'varchar', length: 50, nullable: true, unique: true })
  jiraIssueKey: string | null;

  /** Jira issue type (e.g. "Task", "Bug", "Story") — captured from the synced issue's issuetype field. Null for tasks not created via Jira sync. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  issueType: string | null;

  /** Other Jira issues (usually bugs) that block this one — empty when none or not Jira-synced. */
  @Column({ type: 'text', nullable: true, transformer: JsonArrayColumnTransformer })
  blockedByIssues: BlockedByIssueRef[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
