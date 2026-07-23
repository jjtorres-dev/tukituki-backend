import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import type { DriverLocationPoint } from '../../driver-operations/entities/driver-location.entity';
import { RideLocationRejectionReason } from '../enums/ride-location-rejection-reason.enum';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_location_samples' })
@Index('IDX_ride_location_samples_ride_recorded_at', ['rideId', 'recordedAt'])
@Index('IDX_ride_location_samples_driver_recorded_at', [
  'driverProfileId',
  'recordedAt',
])
@Index('IDX_ride_location_samples_ride_accepted', [
  'rideId',
  'acceptedForMetrics',
])
export class RideLocationSample {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'driver_profile_id', type: 'uuid' })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfile, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'driver_profile_id' })
  driverProfile!: Relation<DriverProfile>;

  @Index('IDX_ride_location_samples_position', { spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  position!: DriverLocationPoint;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  @Column({ type: 'double precision', nullable: true })
  accuracy!: number | null;

  @Column({ type: 'double precision', nullable: true })
  heading!: number | null;

  @Column({ type: 'double precision', nullable: true })
  speed!: number | null;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt!: Date;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({ name: 'accepted_for_metrics', type: 'boolean' })
  acceptedForMetrics!: boolean;

  @Column({
    name: 'rejection_reason',
    type: 'enum',
    enum: RideLocationRejectionReason,
    enumName: 'ride_location_rejection_reason_enum',
    nullable: true,
  })
  rejectionReason!: RideLocationRejectionReason | null;

  @Column({
    name: 'distance_from_previous_meters',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  distanceFromPreviousMeters!: string | null;

  @Column({
    name: 'cumulative_distance_meters',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: '0.00',
  })
  cumulativeDistanceMeters!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
