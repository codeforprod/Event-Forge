import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * TypeORM Entity for Event-Forge Migration Tracking
 *
 * Tracks which migrations have been applied to the database.
 * This allows automatic detection and execution of pending migrations
 * when upgrading Event-Forge versions.
 */
@Entity('event_forge_migrations')
@Index('idx_ef_migration_version', ['version'], { unique: true })
export class EventForgeMigrationEntity {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 255 })
  version: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @CreateDateColumn({ name: 'applied_at' })
  appliedAt: Date;
}
