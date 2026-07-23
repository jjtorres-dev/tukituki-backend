import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { NotificationDeliveryStatus } from '../enums/notification-delivery-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

@Entity({ name: 'user_notifications' })
@Index('UQ_user_notifications_dedupe_key', ['dedupeKey'], { unique: true })
@Index('IDX_user_notifications_user_created_at', ['userId', 'createdAt'])
@Index('IDX_user_notifications_user_unread', ['userId', 'readAt'])
export class UserNotification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type_enum',
  })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 160 })
  title!: string;

  @Column({ type: 'varchar', length: 500 })
  body!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data!: Record<string, string>;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 250 })
  dedupeKey!: string;

  @Column({
    name: 'delivery_status',
    type: 'enum',
    enum: NotificationDeliveryStatus,
    enumName: 'notification_delivery_status_enum',
    default: NotificationDeliveryStatus.PENDING,
  })
  deliveryStatus!: NotificationDeliveryStatus;

  @Column({ name: 'delivery_attempts', type: 'integer', default: 0 })
  deliveryAttempts!: number;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
