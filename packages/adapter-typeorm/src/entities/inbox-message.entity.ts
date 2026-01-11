import { InboxMessage, InboxMessageStatus } from '@prodforcode/event-forge-core';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;
}
