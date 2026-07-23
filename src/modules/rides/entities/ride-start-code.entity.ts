import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { RideStartCodeStatus } from '../enums/ride-start-code-status.enum';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_start_codes' })
@Check(
  'CHK_ride_start_codes_attempts',
  '"failed_attempts" >= 0 AND "maximum_attempts" > 0 AND "failed_attempts" <= "maximum_attempts"',
)
@Check(
  'CHK_ride_start_codes_regenerations',
  '"regeneration_count" >= 0 AND "maximum_regenerations" > 0 AND "regeneration_count" <= "maximum_regenerations"',
)
@Index('UQ_ride_start_codes_ride_id', ['rideId'], {
  unique: true,
})
@Index('IDX_ride_start_codes_status_expires_at', ['status', 'expiresAt'])
export class RideStartCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @OneToOne(() => Ride, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ type: 'varchar', length: 64 })
  nonce!: string;

  @Column({
    type: 'enum',
    enum: RideStartCodeStatus,
    enumName: 'ride_start_code_status_enum',
    default: RideStartCodeStatus.ACTIVE,
  })
  status!: RideStartCodeStatus;

  @Column({ name: 'failed_attempts', type: 'smallint', default: 0 })
  failedAttempts!: number;

  @Column({ name: 'maximum_attempts', type: 'smallint' })
  maximumAttempts!: number;

  @Column({ name: 'regeneration_count', type: 'smallint', default: 0 })
  regenerationCount!: number;

  @Column({ name: 'maximum_regenerations', type: 'smallint' })
  maximumRegenerations!: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @Column({ name: 'locked_at', type: 'timestamptz', nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'regenerated_at', type: 'timestamptz', nullable: true })
  regeneratedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
