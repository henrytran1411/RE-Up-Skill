import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { EmployeeSkill } from '../../skills/entities/employee-skill.entity';
import { BenchLog } from '../../bench-time/entities/bench-log.entity';
import { TaskRecord } from '../../tasks/entities/task-record.entity';
import { Evaluation } from '../../evaluations/entities/evaluation.entity';
import { EmployeeLevelHistory } from './employee-level-history.entity';
import { ContributionRecord } from '../../contribution/entities/contribution-record.entity';
import { EmployeeCertificate } from '../../certificates/entities/employee-certificate.entity';
import { DecimalColumnTransformer } from '../../common/transformers/decimal.transformer';

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

  @Column({ type: 'enum', enum: Role, default: Role.DEVELOPER })
  role: Role;

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
   * Monthly salary, used to derive an hourly cost rate for ROI calculations.
   * Sensitive compensation data — excluded from normal queries (like
   * passwordHash) and only ever fetched via explicit addSelect for HR/Admin
   * or internal ROI math, never returned from the general employee list.
   */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true, select: false, transformer: DecimalColumnTransformer })
  monthlySalary: number | null;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
