import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OutboxMessage, OutboxMessageStatus } from '@event-forge/inbox-outbox-core';

/**
 * TypeORM Entity for Outbox Messages
 * Optimized for PostgreSQL with proper indexes
 */
@Entity('outbox_messages')
@Index(['status', 'scheduledAt', 'createdAt'], {
  where: 'status IN (\'pending\', \'failed\')',
})
@Index(['aggregateType', 'aggregateId'])
@Index(['eventType'])
@Index(['createdAt'])
export class OutboxMessageEntity implements OutboxMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  aggregateType: string;

  @Column({ type: 'varchar', length: 255 })
  aggregateId: string;

  @Column({ type: 'varchar', length: 255 })
  eventType: string;

  @Column({ type: 'simple-json' })
  payload: Record<string, unknown>;

  @Column({ type: 'simple-json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: OutboxMessageStatus,
    default: OutboxMessageStatus.PENDING,
  })
  status: OutboxMessageStatus;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lockedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  lockedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
