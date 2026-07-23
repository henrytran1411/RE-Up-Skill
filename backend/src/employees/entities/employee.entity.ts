import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { EmployeeSkill } from '../../skills/entities/employee-skill.entity';
import { BenchLog } from '../../bench-time/entities/bench-log.entity';
import { TaskRecord } from '../../tasks/entities/task-record.entity';
import { Evaluation } from '../../evaluations/entities/evaluation.entity';
import { EmployeeLevelHistory } from './employee-level-history.entity';
import { ContributionRecord } from '../../contribution/entities/contribution-record.entity';
import { EmployeeCertificate } from '../../certificates/entities/employee-certificate.entity';
import { ProjectContribution } from '../../projects/entities/project-contribution.entity';

@Entity('employees')
export class Employee {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  fullName: string;

  @Column({ unique: true, length: 150 })
  email: string;

  @Column({ select: false })
  passwordHash: string;

  /**
   * Free text matching an EmployeeRole catalog entry's name (see
   * employees/entities/employee-role.entity.ts), not a fixed enum — same
   * pattern as `level` below. Note: the backend's actual permission checks
   * (@Roles(...) decorators) stay hardcoded to the 5 canonical role strings
   * ('developer'/'tech_lead'/'pm'/'hr'/'admin'); renaming or deleting one of
   * those from the catalog breaks that person's real permissions, and a
   * brand-new custom role has no permissions anywhere.
   */
  @Column({ type: 'varchar', length: 50, default: 'developer' })
  role: string;

  /**
   * Overall career level — free text matching a SkillLevel catalog entry's
   * name (see skills/entities/skill-level.entity.ts), not a fixed enum.
   * Auto-promotion (EmployeesService#maybePromote) compares levels by their
   * catalog weight, so this must match a name in that table to participate.
   */
  @Column({ type: 'varchar', length: 50, default: 'Junior' })
  level: string;

  /**
   * Effective date of the current level. Used to pro-rate scoring when an
   * employee changes level mid evaluation-period (see Evaluation module).
   */
  @Column({ type: 'date' })
  levelEffectiveDate: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  currentProject: string | null;

  /** Expected date this employee frees up from their current project — used for capacity planning. Meaningless once currentProject is null; they're already available. */
  @Column({ type: 'date', nullable: true })
  availableFrom: string | null;

  @Column({ type: 'date' })
  joinDate: string;

  @Column({ default: true })
  isActive: boolean;

  /**
   * Jira Cloud accountId this employee maps to, for the daily task sync
   * (see JiraService). Jira Cloud no longer exposes other users' email
   * addresses over the REST API (privacy/GDPR change), so matching by
   * email isn't reliable — accountId is the only stable identifier a
   * plain API token can resolve for someone else's issues. Set once,
   * manually, per employee; there's no way to derive it automatically.
   */
  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  jiraAccountId: string | null;

  @OneToMany(() => EmployeeSkill, (employeeSkill) => employeeSkill.employee)
  skills: EmployeeSkill[];

  @OneToMany(() => BenchLog, (benchLog) => benchLog.employee)
  benchLogs: BenchLog[];

  @OneToMany(() => TaskRecord, (task) => task.employee)
  tasks: TaskRecord[];

  @OneToMany(() => Evaluation, (evaluation) => evaluation.employee)
  evaluations: Evaluation[];

  @OneToMany(() => EmployeeLevelHistory, (levelHistory) => levelHistory.employee)
  levelHistories: EmployeeLevelHistory[];

  @OneToMany(() => ContributionRecord, (record) => record.employee)
  contributionRecords: ContributionRecord[];

  @OneToMany(() => EmployeeCertificate, (certificate) => certificate.employee)
  certificates: EmployeeCertificate[];

  @OneToMany(() => ProjectContribution, (contribution) => contribution.employee)
  projectContributions: ProjectContribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
