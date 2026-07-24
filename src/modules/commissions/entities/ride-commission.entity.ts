import {
  Check,
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
import { RidePayment } from '../../payments/entities/ride-payment.entity';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { Ride } from '../../rides/entities/ride.entity';
import { CommissionCollectionMode } from '../enums/commission-collection-mode.enum';
import { RideCommissionStatus } from '../enums/ride-commission-status.enum';
import { CommissionPolicy } from './commission-policy.entity';

@Entity({ name: 'ride_commissions' })
@Check('CHK_ride_commissions_rate', '"rate_bps" BETWEEN 300 AND 500')
@Check(
  'CHK_ride_commissions_amounts',
  '"base_amount" >= 0 AND "commission_amount" >= 0 AND "driver_net_amount" >= 0 AND "base_amount" = "commission_amount" + "driver_net_amount"',
)
@Index('UQ_ride_commissions_ride', ['rideId'], { unique: true })
@Index('UQ_ride_commissions_payment', ['paymentId'], { unique: true })
@Index('IDX_ride_commissions_driver_status_accrued', [
  'driverProfileId',
  'status',
  'accruedAt',
])
@Index('IDX_ride_commissions_status_accrued', ['status', 'accruedAt'])
export class RideCommission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'ride_id',
    foreignKeyConstraintName: 'FK_ride_commissions_ride',
  })
  ride!: Relation<Ride>;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @ManyToOne(() => RidePayment, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'payment_id',
    foreignKeyConstraintName: 'FK_ride_commissions_payment',
  })
  payment!: Relation<RidePayment>;

  @Column({ name: 'driver_profile_id', type: 'uuid' })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfile, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'driver_profile_id',
    foreignKeyConstraintName: 'FK_ride_commissions_driver',
  })
  driverProfile!: Relation<DriverProfile>;

  @Column({ name: 'policy_id', type: 'uuid', nullable: true })
  policyId!: string | null;

  @ManyToOne(() => CommissionPolicy, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'policy_id',
    foreignKeyConstraintName: 'FK_ride_commissions_policy',
  })
  policy!: Relation<CommissionPolicy> | null;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method_enum',
  })
  paymentMethod!: PaymentMethod;

  @Column({
    name: 'collection_mode',
    type: 'enum',
    enum: CommissionCollectionMode,
    enumName: 'commission_collection_mode_enum',
  })
  collectionMode!: CommissionCollectionMode;

  @Column({
    type: 'enum',
    enum: RideCommissionStatus,
    enumName: 'ride_commission_status_enum',
    default: RideCommissionStatus.ACCRUED,
  })
  status!: RideCommissionStatus;

  @Column({ name: 'rate_bps', type: 'smallint' })
  rateBps!: number;

  @Column({ name: 'base_amount', type: 'numeric', precision: 10, scale: 2 })
  baseAmount!: string;

  @Column({
    name: 'commission_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  commissionAmount!: string;

  @Column({
    name: 'driver_net_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  driverNetAmount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'accrued_at', type: 'timestamptz' })
  accruedAt!: Date;

  @Column({ name: 'held_at', type: 'timestamptz', nullable: true })
  heldAt!: Date | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true })
  reversedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
