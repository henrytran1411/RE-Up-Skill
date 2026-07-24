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
import { TaskStatus } from '../../common/enums/task-status.enum';

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

  /**
   * Human-friendly hierarchy code shown in Task Management instead of the
   * title — e.g. `Epic-1`, `US-1.1` (Story 1 of Epic 1), `Task-1.1.1` (Task 1
   * of that Story), `SubTask-1.1.1.1`/`Bug-1.1.1.1` (SubTask/Bug 1 of that
   * Task). Not derived automatically — set manually or during Jira sync.
   * Null for issues with no assigned code (e.g. ad-hoc tasks), which fall
   * back to showing the title instead.
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  taskCode: string | null;

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

  /**
   * Manually-set workflow status. Kept in sync with `completedAt` by
   * TasksService — moving to COMPLETED stamps `completedAt` (today if not
   * given), moving to TODO/IN_PROGRESS clears it, since every rollup/
   * critical-path/scoring calculation reads `completedAt`, not this field,
   * as the "is this done" signal.
   */
  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.TODO })
  status: TaskStatus;

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

  /**
   * Other TaskRecord rows (by their own `id`, in this same project) that
   * must finish before this one can — the input to the task-level critical
   * path calculation (see TaskCriticalPathService), distinct from the
   * Epic-level `blockedByIssues`/`blockedByEpicKeys` mechanism above. Set
   * manually via the task edit form, or seeded from Jira issue links during
   * sync — either way it's a plain task-id reference, resolved to the
   * blocking task's `taskCode` for display.
   */
  @Column({ type: 'text', nullable: true, transformer: JsonArrayColumnTransformer })
  blockedByTaskIds: string[];

  /** The Epic this issue ultimately belongs to — the Epic's own `jiraIssueKey` (or, for non-Jira example data, any unique key). Set on both a Story (its direct parent) and a Task/Bug/Sub-task (its Story's parent, resolved during sync). Null for the Epic issue itself and for issues with no Epic. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  epicKey: string | null;

  /** The User Story this Task/Bug/Sub-task's immediate parent is — that Story's own `jiraIssueKey`. Null for Epics, for Stories themselves, and for leaf issues linked directly to an Epic with no intervening Story. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  storyKey: string | null;

  /** Which project sprint (see ProjectSprint.id) this task was planned/worked in. Used for the project health check's burndown chart — null if not assigned to a sprint. Not an enforced FK — same loose-reference style as Project.managerId. */
  @Column({ type: 'uuid', nullable: true })
  projectSprintId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
