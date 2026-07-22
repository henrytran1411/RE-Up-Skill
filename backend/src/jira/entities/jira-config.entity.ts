import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Single-row table holding the Jira connection an Admin configured via the
 * Admin page — the admin's own baseUrl/email/apiToken, plus which Jira
 * project(s) they picked from the list fetched with that token. There is no
 * env-var fallback: without a row here, Jira sync is simply unconfigured.
 * apiToken is `select: false` so a plain `find`/`findOne` never returns it;
 * only the sync itself (via an explicit addSelect) ever reads it back out.
 */
@Entity('jira_configs')
export class JiraConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  baseUrl: string;

  @Column()
  email: string;

  @Column({ select: false })
  apiToken: string;

  /** Jira project keys (e.g. "ABC") selected from the fetched project list to sync tasks from. Ignored when syncAllProjects is true. */
  @Column({ type: 'simple-array', nullable: true })
  projectKeys: string[] | null;

  /** When true, every sync pulls every project the Jira account can see (re-fetched each run, so newly created projects are included automatically), ignoring projectKeys. */
  @Column({ type: 'boolean', default: false })
  syncAllProjects: boolean;

  /** Overrides the built-in default Story Points custom field ID when set. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  storyPointsField: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
