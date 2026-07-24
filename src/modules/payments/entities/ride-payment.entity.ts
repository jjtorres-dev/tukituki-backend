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
import { Ride } from '../../rides/entities/ride.entity';
import { User } from '../../users/entities/user.entity';
import { CashPaymentDisputeReason } from '../enums/cash-payment-dispute-reason.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { RidePaymentStatus } from '../enums/ride-payment-status.enum';

@Entity({ name: 'ride_payments' })
@Check(
  'CHK_ride_payments_amounts',
  '"gross_amount" >= 0 AND "discount_amount" >= 0 AND "gross_amount" = "amount_due" + "discount_amount" AND "amount_due" >= 0 AND ("cash_received" IS NULL OR "cash_received" >= 0) AND ("change_given" IS NULL OR "change_given" >= 0)',
)
@Check(
  'CHK_ride_payments_cash_totals',
  '"cash_received" IS NULL OR "cash_received" >= "amount_due"',
)
@Index('UQ_ride_payments_ride_id', ['rideId'], { unique: true })
@Index('IDX_ride_payments_status_created', ['status', 'createdAt'])
@Index('IDX_ride_payments_passenger_status', ['passengerUserId', 'status'])
@Index('IDX_ride_payments_driver_status', ['driverProfileId', 'status'])
export class RidePayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'ride_id',
    foreignKeyConstraintName: 'FK_ride_payments_ride',
  })
  ride!: Relation<Ride>;

  @Column({ name: 'passenger_user_id', type: 'uuid' })
  passengerUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'passenger_user_id',
    foreignKeyConstraintName: 'FK_ride_payments_passenger',
  })
  passengerUser!: Relation<User>;

  @Column({ name: 'driver_profile_id', type: 'uuid' })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfile, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'driver_profile_id',
    foreignKeyConstraintName: 'FK_ride_payments_driver',
  })
  driverProfile!: Relation<DriverProfile>;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method_enum',
  })
  method!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: RidePaymentStatus,
    enumName: 'ride_payment_status_enum',
    default: RidePaymentStatus.PENDING,
  })
  status!: RidePaymentStatus;

  @Column({ name: 'amount_due', type: 'numeric', precision: 10, scale: 2 })
  amountDue!: string;

  @Column({ name: 'gross_amount', type: 'numeric', precision: 10, scale: 2 })
  grossAmount!: string;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  discountAmount!: string;

  @Column({
    name: 'cash_received',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  cashReceived!: string | null;

  @Column({
    name: 'change_given',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  changeGiven!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    name: 'confirmed_by_driver_user_id',
    type: 'uuid',
    nullable: true,
  })
  confirmedByDriverUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'confirmed_by_driver_user_id',
    foreignKeyConstraintName: 'FK_ride_payments_confirmed_by',
  })
  confirmedByDriverUser!: Relation<User> | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @Column({
    name: 'confirmation_notes',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  confirmationNotes!: string | null;

  @Column({
    name: 'dispute_reason',
    type: 'enum',
    enum: CashPaymentDisputeReason,
    enumName: 'cash_payment_dispute_reason_enum',
    nullable: true,
  })
  disputeReason!: CashPaymentDisputeReason | null;

  @Column({
    name: 'dispute_detail',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  disputeDetail!: string | null;

  @Column({ name: 'disputed_at', type: 'timestamptz', nullable: true })
  disputedAt!: Date | null;

  @Column({
    name: 'resolved_by_admin_user_id',
    type: 'uuid',
    nullable: true,
  })
  resolvedByAdminUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'resolved_by_admin_user_id',
    foreignKeyConstraintName: 'FK_ride_payments_resolved_by',
  })
  resolvedByAdminUser!: Relation<User> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({
    name: 'resolution_notes',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  resolutionNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
