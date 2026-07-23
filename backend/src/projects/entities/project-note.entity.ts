import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Employee } from '../../employees/entities/employee.entity';

/**
 * A single, timestamped note a PM (or other manager) leaves on a project —
 * a running journal (status updates, decisions, risks) rather than a
 * single overwritable field like Project.notes. Matched to Project.name
 * the same loose, non-FK way TaskRecord.projectName is.
 */
@Entity('project_notes')
export class ProjectNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 150 })
  projectName: string;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Employee, (employee) => employee.projectNotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author: Employee;

  @Column()
  authorId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
