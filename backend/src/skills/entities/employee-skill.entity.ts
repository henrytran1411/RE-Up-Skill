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
import { Skill } from './skill.entity';
import { SkillStatus } from '../../common/enums/skill-status.enum';

export enum SkillTrack {
  CURRENT = 'current',
  LEARNING = 'learning',
}

@Entity('employee_skills')
export class EmployeeSkill {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.skills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  @ManyToOne(() => Skill, { eager: true })
  @JoinColumn({ name: 'skillId' })
  skill: Skill;

  @Column()
  skillId: string;

  @Column({ type: 'enum', enum: SkillTrack, default: SkillTrack.CURRENT })
  track: SkillTrack;

  /** Proficiency 1-5. For LEARNING track this reflects current progress. */
  @Column({ type: 'int', default: 1 })
  proficiency: number;

  /**
   * Career level for this specific skill (e.g. Senior at React, Middle at PHP).
   * Only meaningful for CURRENT track entries; an employee's overall level is
   * the highest level among their CONFIRMED current skills (see
   * employees.service.ts#maybePromote).
   */
  @Column({ type: 'varchar', length: 50, nullable: true })
  level: string | null;

  /** Target proficiency for LEARNING track skills. */
  @Column({ type: 'int', nullable: true })
  targetProficiency: number | null;

  /** Self-declared learning progress percentage (0-100), LEARNING track only. */
  @Column({ type: 'int', nullable: true })
  progressPercent: number | null;

  /** Verification lifecycle; only CONFIRMED entries count toward the skill score. */
  @Column({ type: 'enum', enum: SkillStatus, default: SkillStatus.START })
  status: SkillStatus;

  /**
   * This employee's flagship skill within its skill's category (e.g. their
   * main Backend skill). At most one CURRENT-track entry per employee per
   * category may be primary — enforced in SkillsService#setPrimarySkill, not
   * a DB constraint, since "category" lives on the joined Skill row.
   */
  @Column({ default: false })
  isPrimary: boolean;

  /** Start of the tracked study/usage period for this skill-history entry. */
  @Column({ type: 'date' })
  startDate: string;

  /** End of the tracked period; null while still ongoing. Set automatically on confirm. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'uuid', nullable: true })
  verifiedById: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  confirmedById: string | null;

  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
