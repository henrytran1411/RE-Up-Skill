import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';
import { ProjectBoardType } from '../../common/enums/project-board-type.enum';

/**
 * Admin-level record for a project. Projects themselves aren't a normalized
 * entity elsewhere in the system — `TaskRecord.projectName` is a free-text
 * field — so this table is keyed by that same name rather than an FK, and
 * exists to hold what task records can't carry: how much money the project
 * brought in, and who's responsible for it (used to scope a PM's visibility
 * to only the projects they manage).
 */
@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 150 })
  name: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, transformer: DecimalColumnTransformer })
  revenue: number;

  /** The PM responsible for this project. Not an enforced FK — same loose-reference style as verifiedById/reviewedById elsewhere. */
  @Column({ type: 'uuid', nullable: true })
  managerId: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** PM/Admin-declared kickoff date — anchors the Sprint tab's quick-create-sprints generator. */
  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  /** PM/Admin-declared target completion date — the project health check compares its computed critical-path finish against this. */
  @Column({ type: 'date', nullable: true })
  targetEndDate: string | null;

  /** Kanban vs. Agile (sprint-based) — hides the Sprint tab for Kanban projects. Defaults to AGILE; a Jira sync sets it explicitly based on whether the project's issues actually carry Sprint field data. */
  @Column({ type: 'enum', enum: ProjectBoardType, default: ProjectBoardType.AGILE })
  projectBoardType: ProjectBoardType;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
