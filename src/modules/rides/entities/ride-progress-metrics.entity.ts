import {
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

import { Ride } from './ride.entity';

@Entity({ name: 'ride_progress_metrics' })
@Index('UQ_ride_progress_metrics_ride_id', ['rideId'], { unique: true })
export class RideProgressMetrics {
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

  @Column({ name: 'accepted_samples', type: 'integer', default: 0 })
  acceptedSamples!: number;

  @Column({ name: 'rejected_samples', type: 'integer', default: 0 })
  rejectedSamples!: number;

  @Column({
    name: 'tracked_distance_meters',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: '0.00',
  })
  trackedDistanceMeters!: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({
    name: 'last_received_sample_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastReceivedSampleAt!: Date | null;

  @Column({
    name: 'last_accepted_sample_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastAcceptedSampleAt!: Date | null;

  @Column({
    name: 'last_accepted_sample_id',
    type: 'uuid',
    nullable: true,
  })
  lastAcceptedSampleId!: string | null;

  @Column({
    name: 'calculated_duration_seconds',
    type: 'integer',
    default: 0,
  })
  calculatedDurationSeconds!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
