import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { FareRule } from '../../fares/entities/fare-rule.entity';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_final_fares' })
@Index('UQ_ride_final_fares_ride_id', ['rideId'], { unique: true })
export class RideFinalFare {
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

  @Column({ name: 'fare_rule_id', type: 'uuid' })
  fareRuleId!: string;

  @ManyToOne(() => FareRule, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'fare_rule_id' })
  fareRule!: Relation<FareRule>;

  @Column({ name: 'tracked_distance_meters', type: 'integer' })
  trackedDistanceMeters!: number;

  @Column({ name: 'actual_duration_seconds', type: 'integer' })
  actualDurationSeconds!: number;

  @Column({ name: 'base_fare', type: 'numeric', precision: 10, scale: 2 })
  baseFare!: string;

  @Column({
    name: 'distance_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  distanceAmount!: string;

  @Column({ name: 'time_amount', type: 'numeric', precision: 10, scale: 2 })
  timeAmount!: string;

  @Column({ name: 'booking_fee', type: 'numeric', precision: 10, scale: 2 })
  bookingFee!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  subtotal!: string;

  @Column({
    name: 'adjustment_multiplier',
    type: 'numeric',
    precision: 6,
    scale: 3,
  })
  adjustmentMultiplier!: string;

  @Column({
    name: 'calculated_final_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  calculatedFinalFare!: string;

  @Column({ name: 'final_fare', type: 'numeric', precision: 10, scale: 2 })
  finalFare!: string;

  @Column({
    name: 'fare_cap_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  fareCapAmount!: string;

  @Column({ name: 'fare_was_capped', type: 'boolean', default: false })
  fareWasCapped!: boolean;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'calculation_version', type: 'varchar', length: 30 })
  calculationVersion!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
