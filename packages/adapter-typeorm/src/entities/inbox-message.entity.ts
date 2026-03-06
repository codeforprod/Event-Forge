import { InboxMessage, InboxMessageStatus } from '@prodforcode/event-forge-core';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';


/**
 * TypeORM Entity for Inbox Messages
 * Optimized for PostgreSQL with proper indexes and unique constraint for deduplication
 */
@Entity('inbox_messages')
@Index('idx_inbox_unique', ['messageId', 'source'], { unique: true })
@Index('idx_inbox_event_type', ['eventType'])
@Index('idx_inbox_status', ['status'])
@Index('idx_inbox_created_at', ['createdAt'])
@Index('idx_inbox_received_at', ['receivedAt'])
export class InboxMessageEntity implements InboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'message_id', type: 'varchar', length: 255 })
  messageId: string;

  @Column({ type: 'varchar', length: 255 })
  source: string;

  @Column({ name: 'event_type', type: 'varchar', length: 255 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: InboxMessageStatus,
    default: InboxMessageStatus.RECEIVED,
  })
  status: InboxMessageStatus;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries: number;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'recovery_attempts', type: 'int', default: 0 })
  recoveryAttempts: number;

  @Column({ name: 'last_recovered_at', type: 'timestamptz', nullable: true })
  lastRecoveredAt?: Date;

  @Column({ name: 'recovery_reason', type: 'text', nullable: true })
  recoveryReason?: string;
}
