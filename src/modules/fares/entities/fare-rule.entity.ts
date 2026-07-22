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
import { FareRuleStatus } from '../enums/fare-rule-status.enum';

@Entity({
  name: 'fare_rules',
})
@Index('IDX_fare_rules_zone_status_effective_from', [
  'serviceZoneId',
  'status',
  'effectiveFrom',
])
@Index('IDX_fare_rules_effective_until', ['effectiveUntil'])
export class FareRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'service_zone_id',
    type: 'uuid',
  })
  serviceZoneId!: string;

  @ManyToOne(() => ServiceZone, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'service_zone_id',
  })
  serviceZone!: Relation<ServiceZone>;

  @Column({
    type: 'varchar',
    length: 120,
  })
  name!: string;

  @Column({
    name: 'base_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  baseFare!: string;

  @Column({
    name: 'minimum_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  minimumFare!: string;

  @Column({
    name: 'price_per_km',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  pricePerKm!: string;

  @Column({
    name: 'price_per_minute',
    type: 'numeric',
    precision: 10,
    scale: 4,
  })
  pricePerMinute!: string;

  @Column({
    name: 'booking_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  bookingFee!: string;

  @Column({
    name: 'waiting_price_per_minute',
    type: 'numeric',
    precision: 10,
    scale: 4,
    default: '0.0000',
  })
  waitingPricePerMinute!: string;

  @Column({
    name: 'cancellation_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  cancellationFee!: string;

  @Column({
    name: 'night_multiplier',
    type: 'numeric',
    precision: 6,
    scale: 3,
    default: '1.000',
  })
  nightMultiplier!: string;

  @Column({
    name: 'rain_multiplier',
    type: 'numeric',
    precision: 6,
    scale: 3,
    default: '1.000',
  })
  rainMultiplier!: string;

  @Column({
    type: 'char',
    length: 3,
    default: 'PEN',
  })
  currency!: string;

  @Column({
    type: 'enum',
    enum: FareRuleStatus,
    enumName: 'fare_rule_status_enum',
    default: FareRuleStatus.DRAFT,
  })
  status!: FareRuleStatus;

  @Column({
    name: 'effective_from',
    type: 'timestamptz',
  })
  effectiveFrom!: Date;

  @Column({
    name: 'effective_until',
    type: 'timestamptz',
    nullable: true,
  })
  effectiveUntil!: Date | null;

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
