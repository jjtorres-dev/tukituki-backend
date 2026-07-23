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

import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { FareQuote } from '../../fares/entities/fare-quote.entity';
import type { FareQuotePoint } from '../../fares/entities/fare-quote.entity';
import { ServiceZone } from '../../service-zones/entities/service-zone.entity';
import { User } from '../../users/entities/user.entity';
import { RideCancellationActor } from '../enums/ride-cancellation-actor.enum';
import { RideStatus } from '../enums/ride-status.enum';

@Entity({
  name: 'rides',
})
@Index('IDX_rides_passenger_requested_at', ['passengerUserId', 'requestedAt'])
@Index('IDX_rides_driver_status', ['driverProfileId', 'status'])
@Index('IDX_rides_status_search_expires_at', ['status', 'searchExpiresAt'])
@Index('UQ_rides_active_passenger', ['passengerUserId'], {
  unique: true,
  where:
    `"status" IN (` +
    `'SEARCHING_DRIVER', 'DRIVER_ASSIGNED', ` +
    `'DRIVER_ARRIVING', 'DRIVER_ARRIVED', 'IN_PROGRESS')`,
})
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'passenger_user_id',
    type: 'uuid',
  })
  passengerUserId!: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'passenger_user_id',
  })
  passengerUser!: Relation<User>;

  @Column({
    name: 'driver_profile_id',
    type: 'uuid',
    nullable: true,
  })
  driverProfileId!: string | null;

  @ManyToOne(() => DriverProfile, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'driver_profile_id',
  })
  driverProfile!: Relation<DriverProfile> | null;

  @Column({
    name: 'fare_quote_id',
    type: 'uuid',
    unique: true,
  })
  fareQuoteId!: string;

  @ManyToOne(() => FareQuote, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'fare_quote_id',
  })
  fareQuote!: Relation<FareQuote>;

  @Column({
    name: 'origin_zone_id',
    type: 'uuid',
  })
  originZoneId!: string;

  @ManyToOne(() => ServiceZone, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'origin_zone_id',
  })
  originZone!: Relation<ServiceZone>;

  @Column({
    name: 'destination_zone_id',
    type: 'uuid',
  })
  destinationZoneId!: string;

  @ManyToOne(() => ServiceZone, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'destination_zone_id',
  })
  destinationZone!: Relation<ServiceZone>;

  @Index('IDX_rides_origin_position', {
    spatial: true,
  })
  @Column({
    name: 'origin_position',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  originPosition!: FareQuotePoint;

  @Index('IDX_rides_destination_position', {
    spatial: true,
  })
  @Column({
    name: 'destination_position',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  destinationPosition!: FareQuotePoint;

  @Column({
    name: 'origin_address',
    type: 'varchar',
    length: 300,
  })
  originAddress!: string;

  @Column({
    name: 'destination_address',
    type: 'varchar',
    length: 300,
  })
  destinationAddress!: string;

  @Column({
    name: 'distance_meters',
    type: 'integer',
  })
  distanceMeters!: number;

  @Column({
    name: 'estimated_duration_seconds',
    type: 'integer',
  })
  estimatedDurationSeconds!: number;

  @Column({
    name: 'estimated_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  estimatedFare!: string;

  @Column({
    name: 'final_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  finalFare!: string | null;

  @Column({
    type: 'char',
    length: 3,
  })
  currency!: string;

  @Column({
    type: 'enum',
    enum: RideStatus,
    enumName: 'ride_status_enum',
    default: RideStatus.SEARCHING_DRIVER,
  })
  status!: RideStatus;

  @Column({
    name: 'passenger_notes',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  passengerNotes!: string | null;

  @Column({
    name: 'requested_at',
    type: 'timestamptz',
  })
  requestedAt!: Date;

  @Column({
    name: 'search_expires_at',
    type: 'timestamptz',
  })
  searchExpiresAt!: Date;

  @Column({
    name: 'driver_assigned_at',
    type: 'timestamptz',
    nullable: true,
  })
  driverAssignedAt!: Date | null;

  @Column({
    name: 'driver_arrived_at',
    type: 'timestamptz',
    nullable: true,
  })
  driverArrivedAt!: Date | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    nullable: true,
  })
  startedAt!: Date | null;

  @Column({
    name: 'completed_at',
    type: 'timestamptz',
    nullable: true,
  })
  completedAt!: Date | null;

  @Column({
    name: 'cancelled_at',
    type: 'timestamptz',
    nullable: true,
  })
  cancelledAt!: Date | null;

  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 300,
    nullable: true,
  })
  cancellationReason!: string | null;

  @Column({
    name: 'cancelled_by',
    type: 'enum',
    enum: RideCancellationActor,
    enumName: 'ride_cancellation_actor_enum',
    nullable: true,
  })
  cancelledBy!: RideCancellationActor | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}
