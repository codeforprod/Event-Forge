import { OutboxMessage, OutboxMessageStatus } from '@prodforcode/event-forge-core';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';


/**
 * TypeORM Entity for Outbox Messages
 * Optimized for PostgreSQL with proper indexes
 */
@Entity('outbox_messages')
@Index('idx_outbox_pending', ['status', 'scheduledAt', 'createdAt'], {
  where: 'status IN (\'pending\', \'failed\')',
})
@Index('idx_outbox_aggregate', ['aggregateType', 'aggregateId'])
@Index('idx_outbox_event_type', ['eventType'])
@Index('idx_outbox_created_at', ['createdAt'])
export class OutboxMessageEntity implements OutboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 255 })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 255 })
  aggregateId: string;

  @Column({ name: 'event_type', type: 'varchar', length: 255 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: OutboxMessageStatus,
    default: OutboxMessageStatus.PENDING,
  })
  status: OutboxMessageStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', type: 'int', default: 5 })
  maxRetries: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz', default: () => 'now()' })
  scheduledAt?: Date;

  @Column({ name: 'locked_by', type: 'varchar', length: 255, nullable: true })
  lockedBy?: string;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
