import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { InboxMessage, InboxMessageStatus } from '@event-forge/inbox-outbox-core';

/**
 * TypeORM Entity for Inbox Messages
 * Optimized for PostgreSQL with proper indexes and unique constraint for deduplication
 */
@Entity('inbox_messages')
@Index(['messageId', 'source'], { unique: true })
@Index(['eventType'])
@Index(['status'])
@Index(['createdAt'])
export class InboxMessageEntity implements InboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  messageId: string;

  @Column({ type: 'varchar', length: 255 })
  source: string;

  @Column({ type: 'varchar', length: 255 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: InboxMessageStatus,
    default: InboxMessageStatus.RECEIVED,
  })
  status: InboxMessageStatus;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn()
  createdAt: Date;
}
