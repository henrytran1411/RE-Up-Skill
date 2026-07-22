import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum JiraSyncStatus {
  SUCCESS = 'success',
  PARTIAL = 'partial',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/** One row per sync run (daily cron or manual trigger) — the only visibility into what an unattended background job actually did. */
@Entity('jira_sync_logs')
export class JiraSyncLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  startedAt: Date;

  @Column({ type: 'timestamp' })
  finishedAt: Date;

  @Column({ type: 'enum', enum: JiraSyncStatus })
  status: JiraSyncStatus;

  @Column({ type: 'int', default: 0 })
  issuesFetched: number;

  @Column({ type: 'int', default: 0 })
  tasksCreated: number;

  @Column({ type: 'int', default: 0 })
  tasksUpdated: number;

  /** Issues fetched but not synced — unassigned, no employee mapped to that Jira account, or a per-issue mapping error. */
  @Column({ type: 'int', default: 0 })
  tasksSkipped: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  /** JSON-encoded array of {accountId, displayName, issueCount} — assignees seen this run with no matching Employee.jiraAccountId. */
  @Column({ type: 'text', nullable: true })
  unmatchedAssignees: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
