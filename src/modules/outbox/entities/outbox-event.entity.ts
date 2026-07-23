import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { OutboxEventStatus } from '../enums/outbox-event-status.enum';
import { OutboxEventType } from '../enums/outbox-event-type.enum';

@Entity({ name: 'outbox_events' })
@Index('IDX_outbox_events_status_available_at', ['status', 'availableAt'])
@Index('IDX_outbox_events_processing_locked_at', ['status', 'lockedAt'])
@Index('IDX_outbox_events_aggregate', [
  'aggregateType',
  'aggregateId',
  'createdAt',
])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'aggregate_type', type: 'varchar', length: 80 })
  aggregateType!: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: OutboxEventType,
    enumName: 'outbox_event_type_enum',
  })
  eventType!: OutboxEventType;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  payload!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    enumName: 'outbox_event_status_enum',
    default: OutboxEventStatus.PENDING,
  })
  status!: OutboxEventStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'available_at', type: 'timestamptz' })
  availableAt!: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'locked_by', type: 'varchar', length: 120, nullable: true })
  lockedBy!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
