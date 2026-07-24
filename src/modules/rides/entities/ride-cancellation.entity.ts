import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { CancellationFeeStatus } from '../enums/cancellation-fee-status.enum';
import { RideCancellationActor } from '../enums/ride-cancellation-actor.enum';
import { RideCancellationType } from '../enums/ride-cancellation-type.enum';
import { RideStatus } from '../enums/ride-status.enum';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_cancellations' })
@Check(
  'CHK_ride_cancellations_fees',
  '"calculated_fee" >= 0 AND "charged_fee" >= 0 AND "waived_amount" >= 0',
)
@Index('UQ_ride_cancellations_ride_id', ['rideId'], { unique: true })
@Index('IDX_ride_cancellations_actor_created_at', ['actorType', 'createdAt'])
@Index('IDX_ride_cancellations_fee_status_created_at', [
  'feeStatus',
  'createdAt',
])
@Index('IDX_ride_cancellations_created_reporting', ['createdAt'])
export class RideCancellation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @OneToOne(() => Ride, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: RideCancellationActor,
    enumName: 'ride_cancellation_actor_enum',
  })
  actorType!: RideCancellationActor;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: Relation<User> | null;

  @Column({ name: 'reason_code', type: 'varchar', length: 80 })
  reasonCode!: string;

  @Column({
    name: 'reason_detail',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  reasonDetail!: string | null;

  @Column({
    name: 'ride_status_before',
    type: 'enum',
    enum: RideStatus,
    enumName: 'ride_status_enum',
  })
  rideStatusBefore!: RideStatus;

  @Column({
    name: 'cancellation_type',
    type: 'enum',
    enum: RideCancellationType,
    enumName: 'ride_cancellation_type_enum',
  })
  cancellationType!: RideCancellationType;

  @Column({
    name: 'calculated_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  calculatedFee!: string;

  @Column({
    name: 'charged_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  chargedFee!: string;

  @Column({
    name: 'waived_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  waivedAmount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    name: 'fee_status',
    type: 'enum',
    enum: CancellationFeeStatus,
    enumName: 'cancellation_fee_status_enum',
    default: CancellationFeeStatus.NOT_APPLICABLE,
  })
  feeStatus!: CancellationFeeStatus;

  @Column({
    name: 'distance_to_reference_meters',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  distanceToReferenceMeters!: string | null;

  @Column({ name: 'waiting_seconds', type: 'integer', nullable: true })
  waitingSeconds!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
