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
import { CancellationPolicy } from './cancellation-policy.entity';
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
@Index('UQ_rides_active_driver', ['driverProfileId'], {
  unique: true,
  where:
    `"driver_profile_id" IS NOT NULL AND "status" IN (` +
    `'DRIVER_ASSIGNED', 'DRIVER_ARRIVING', ` +
    `'DRIVER_ARRIVED', 'IN_PROGRESS')`,
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
    name: 'pricing_base_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pricingBaseFare!: string | null;

  @Column({
    name: 'pricing_minimum_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pricingMinimumFare!: string | null;

  @Column({
    name: 'pricing_price_per_km',
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  pricingPricePerKm!: string | null;

  @Column({
    name: 'pricing_price_per_minute',
    type: 'numeric',
    precision: 10,
    scale: 4,
    nullable: true,
  })
  pricingPricePerMinute!: string | null;

  @Column({
    name: 'pricing_booking_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  pricingBookingFee!: string | null;

  @Column({
    name: 'pricing_adjustment_multiplier',
    type: 'numeric',
    precision: 6,
    scale: 3,
    nullable: true,
  })
  pricingAdjustmentMultiplier!: string | null;

  @Column({
    name: 'pricing_currency',
    type: 'char',
    length: 3,
    nullable: true,
  })
  pricingCurrency!: string | null;

  @Column({
    name: 'pricing_calculation_version',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  pricingCalculationVersion!: string | null;

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
    name: 'dispatch_round',
    type: 'smallint',
    default: 0,
  })
  dispatchRound!: number;

  @Column({
    name: 'last_dispatch_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastDispatchAt!: Date | null;

  @Column({
    name: 'driver_assigned_at',
    type: 'timestamptz',
    nullable: true,
  })
  driverAssignedAt!: Date | null;

  @Column({
    name: 'driver_arriving_at',
    type: 'timestamptz',
    nullable: true,
  })
  driverArrivingAt!: Date | null;

  @Column({
    name: 'driver_arrived_at',
    type: 'timestamptz',
    nullable: true,
  })
  driverArrivedAt!: Date | null;

  @Column({
    name: 'arrival_distance_meters',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  arrivalDistanceMeters!: string | null;

  @Column({
    name: 'state_version',
    type: 'integer',
    default: 0,
  })
  stateVersion!: number;

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
    name: 'actual_distance_meters',
    type: 'integer',
    nullable: true,
  })
  actualDistanceMeters!: number | null;

  @Column({
    name: 'actual_duration_seconds',
    type: 'integer',
    nullable: true,
  })
  actualDurationSeconds!: number | null;

  @Column({
    name: 'destination_arrival_distance_meters',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  destinationArrivalDistanceMeters!: string | null;

  @Column({
    name: 'calculated_final_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  calculatedFinalFare!: string | null;

  @Column({
    name: 'fare_was_capped',
    type: 'boolean',
    nullable: true,
  })
  fareWasCapped!: boolean | null;

  @Column({
    name: 'completion_notes',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  completionNotes!: string | null;

  @Index('IDX_rides_cancellation_policy_id')
  @Column({
    name: 'cancellation_policy_id',
    type: 'uuid',
    nullable: true,
  })
  cancellationPolicyId!: string | null;

  @ManyToOne(() => CancellationPolicy, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'cancellation_policy_id',
  })
  cancellationPolicy!: Relation<CancellationPolicy> | null;

  @Column({
    name: 'cancellation_grace_period_seconds',
    type: 'integer',
    nullable: true,
  })
  cancellationGracePeriodSeconds!: number | null;

  @Column({
    name: 'cancellation_assigned_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  cancellationAssignedFee!: string | null;

  @Column({
    name: 'cancellation_arriving_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  cancellationArrivingFee!: string | null;

  @Column({
    name: 'cancellation_arrived_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  cancellationArrivedFee!: string | null;

  @Column({
    name: 'passenger_no_show_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  passengerNoShowFee!: string | null;

  @Column({
    name: 'driver_no_show_compensation',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  driverNoShowCompensation!: string | null;

  @Column({
    name: 'driver_arrival_wait_seconds',
    type: 'integer',
    nullable: true,
  })
  driverArrivalWaitSeconds!: number | null;

  @Column({
    name: 'driver_no_progress_seconds',
    type: 'integer',
    nullable: true,
  })
  driverNoProgressSeconds!: number | null;

  @Column({
    name: 'driver_no_progress_min_meters',
    type: 'integer',
    nullable: true,
  })
  driverNoProgressMinMeters!: number | null;

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
