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

import { ServiceZone } from '../../service-zones/entities/service-zone.entity';
import { User } from '../../users/entities/user.entity';
import { FareRule } from './fare-rule.entity';
import { FareQuoteStatus } from '../enums/fare-quote-status.enum';

export interface FareQuotePoint {
  type: 'Point';
  coordinates: [number, number];
}

@Entity({
  name: 'fare_quotes',
})
@Index('IDX_fare_quotes_passenger_status_expires_at', [
  'passengerUserId',
  'status',
  'expiresAt',
])
@Index('IDX_fare_quotes_status_expires_at', ['status', 'expiresAt'])
export class FareQuote {
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
    name: 'fare_rule_id',
    type: 'uuid',
  })
  fareRuleId!: string;

  @ManyToOne(() => FareRule, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'fare_rule_id',
  })
  fareRule!: Relation<FareRule>;

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

  @Index('IDX_fare_quotes_origin_position', {
    spatial: true,
  })
  @Column({
    name: 'origin_position',
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  originPosition!: FareQuotePoint;

  @Index('IDX_fare_quotes_destination_position', {
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
    name: 'duration_seconds',
    type: 'integer',
  })
  durationSeconds!: number;

  @Column({
    name: 'base_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  baseFare!: string;

  @Column({
    name: 'distance_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  distanceAmount!: string;

  @Column({
    name: 'time_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  timeAmount!: string;

  @Column({
    name: 'booking_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  bookingFee!: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  subtotal!: string;

  @Column({
    name: 'adjustment_multiplier',
    type: 'numeric',
    precision: 6,
    scale: 3,
  })
  adjustmentMultiplier!: string;

  @Column({
    name: 'estimated_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  estimatedFare!: string;

  @Column({
    type: 'char',
    length: 3,
  })
  currency!: string;

  @Column({
    name: 'is_night',
    type: 'boolean',
    default: false,
  })
  isNight!: boolean;

  @Column({
    name: 'is_raining',
    type: 'boolean',
    default: false,
  })
  isRaining!: boolean;

  @Column({
    type: 'enum',
    enum: FareQuoteStatus,
    enumName: 'fare_quote_status_enum',
    default: FareQuoteStatus.ACTIVE,
  })
  status!: FareQuoteStatus;

  @Column({
    name: 'expires_at',
    type: 'timestamptz',
  })
  expiresAt!: Date;

  @Column({
    name: 'used_at',
    type: 'timestamptz',
    nullable: true,
  })
  usedAt!: Date | null;

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
