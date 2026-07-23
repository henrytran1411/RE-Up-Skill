import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * A PM/Tech Lead-defined sprint window for one project — created here
 * because Jira's own sprint field is instance-specific and often incomplete
 * for backlog items, so `TaskRecord.sprintNumber` is assigned manually
 * against these rather than synced. Matched to `Project.name` the same
 * loose, non-FK way `TaskRecord.projectName` already is.
 */
@Entity('project_sprints')
@Unique(['projectName', 'sprintNumber'])
export class ProjectSprint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  projectName: string;

  /** 1-based — matches TaskRecord.sprintNumber and the project health check's burndown chart. */
  @Column({ type: 'int' })
  sprintNumber: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name: string | null;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  /** Free-form planning/retrospective notes for this sprint — optional. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
