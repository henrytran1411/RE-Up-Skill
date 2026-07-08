import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Employee } from './employee.entity';
import { LevelHistorySource } from '../../common/enums/level-history-source.enum';

/**
 * One row per stretch of time an employee spent at a given overall level.
 * A promotion closes the currently-open row (sets its endDate) and opens a
 * new one — see EmployeesService#openLevelHistory. Never mutated after the
 * fact except to close it out, so this is an append-only ledger of the
 * Junior -> Middle -> Senior journey.
 */
@Entity('employee_level_histories')
export class EmployeeLevelHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Employee, (employee) => employee.levelHistories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employeeId' })
  employee: Employee;

  @Column()
  employeeId: string;

  /** Free text matching a SkillLevel catalog entry's name — see Employee.level. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  level: string | null;

  @Column({ type: 'date' })
  startDate: string;

  /** Null while this is the employee's current level. */
  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'enum', enum: LevelHistorySource })
  source: LevelHistorySource;

  /** Employee who triggered this (confirmer for auto-promotion, HR/Admin for manual). */
  @Column({ type: 'uuid', nullable: true })
  setById: string | null;

  /** The skill-history entry whose confirmation triggered an auto-promotion, if any. */
  @Column({ type: 'uuid', nullable: true })
  triggeredBySkillId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
