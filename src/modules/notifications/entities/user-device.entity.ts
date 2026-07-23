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
import { DevicePlatform } from '../enums/device-platform.enum';

@Entity({ name: 'user_devices' })
@Index('UQ_user_devices_user_device', ['userId', 'deviceId'], { unique: true })
@Index('UQ_user_devices_active_push_token', ['pushToken'], {
  unique: true,
  where: '"revoked_at" IS NULL',
})
@Index('IDX_user_devices_user_active', ['userId', 'revokedAt'])
export class UserDevice {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({
    type: 'enum',
    enum: DevicePlatform,
    enumName: 'device_platform_enum',
  })
  platform!: DevicePlatform;

  @Column({ name: 'push_token', type: 'varchar', length: 500 })
  pushToken!: string;

  @Column({ name: 'device_id', type: 'varchar', length: 200 })
  deviceId!: string;

  @Column({ name: 'app_version', type: 'varchar', length: 50, nullable: true })
  appVersion!: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
