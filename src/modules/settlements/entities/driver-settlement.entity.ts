import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { User } from '../../users/entities/user.entity';
import { SettlementDirection } from '../enums/settlement-direction.enum';
import { SettlementStatus } from '../enums/settlement-status.enum';
import { DriverSettlementItem } from './driver-settlement-item.entity';

@Entity({ name: 'driver_settlements' })
@Check('CHK_driver_settlements_period', '"period_end" > "period_start"')
@Check(
  'CHK_driver_settlements_amounts',
  '"ride_count" > 0 AND "gross_fare_amount" >= 0 AND "platform_commission_amount" >= 0 AND "digital_net_amount" >= 0 AND "cash_commission_amount" >= 0 AND "settlement_amount" >= 0',
)
@Check(
  'CHK_driver_settlements_direction',
  '("direction" = \'PLATFORM_TO_DRIVER\' AND "digital_net_amount" + "promotion_credit_amount" > "cash_commission_amount" AND "settlement_amount" = "digital_net_amount" + "promotion_credit_amount" - "cash_commission_amount") OR ("direction" = \'DRIVER_TO_PLATFORM\' AND "cash_commission_amount" > "digital_net_amount" + "promotion_credit_amount" AND "settlement_amount" = "cash_commission_amount" - "digital_net_amount" - "promotion_credit_amount") OR ("direction" = \'BALANCED\' AND "digital_net_amount" + "promotion_credit_amount" = "cash_commission_amount" AND "settlement_amount" = 0)',
)
@Check(
  'CHK_driver_settlements_lifecycle',
  '("status" = \'DRAFT\' AND "approved_at" IS NULL AND "settled_at" IS NULL AND "cancelled_at" IS NULL) OR ("status" = \'APPROVED\' AND "approved_at" IS NOT NULL AND "settled_at" IS NULL AND "cancelled_at" IS NULL) OR ("status" = \'SETTLED\' AND "approved_at" IS NOT NULL AND "settled_at" IS NOT NULL AND "cancelled_at" IS NULL) OR ("status" = \'CANCELLED\' AND "cancelled_at" IS NOT NULL AND "settled_at" IS NULL)',
)
@Index('UQ_driver_settlements_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('UQ_driver_settlements_transfer_reference', ['transferReference'], {
  unique: true,
  where: '"transfer_reference" IS NOT NULL',
})
@Index('IDX_driver_settlements_driver_created', [
  'driverProfileId',
  'createdAt',
])
@Index('IDX_driver_settlements_status_created', ['status', 'createdAt'])
@Index(
  'UQ_driver_settlements_active_driver_currency',
  ['driverProfileId', 'currency'],
  {
    unique: true,
    where: "\"status\" IN ('DRAFT', 'APPROVED')",
  },
)
export class DriverSettlement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'driver_profile_id', type: 'uuid' })
  driverProfileId!: string;

  @ManyToOne(() => DriverProfile, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'driver_profile_id',
    foreignKeyConstraintName: 'FK_driver_settlements_driver',
  })
  driverProfile!: Relation<DriverProfile>;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @Column({ name: 'period_start', type: 'timestamptz' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'timestamptz' })
  periodEnd!: Date;

  @Column({
    type: 'enum',
    enum: SettlementStatus,
    enumName: 'driver_settlement_status_enum',
    default: SettlementStatus.DRAFT,
  })
  status!: SettlementStatus;

  @Column({
    type: 'enum',
    enum: SettlementDirection,
    enumName: 'driver_settlement_direction_enum',
  })
  direction!: SettlementDirection;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'ride_count', type: 'integer' })
  rideCount!: number;

  @Column({
    name: 'gross_fare_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  grossFareAmount!: string;

  @Column({
    name: 'platform_commission_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  platformCommissionAmount!: string;

  @Column({
    name: 'digital_net_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  digitalNetAmount!: string;

  @Column({
    name: 'cash_commission_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  cashCommissionAmount!: string;

  @Column({
    name: 'promotion_credit_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: '0.00',
  })
  promotionCreditAmount!: string;

  @Column({
    name: 'settlement_amount',
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  settlementAmount!: string;

  @Column({ name: 'created_by_admin_user_id', type: 'uuid' })
  createdByAdminUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by_admin_user_id',
    foreignKeyConstraintName: 'FK_driver_settlements_created_by',
  })
  createdByAdminUser!: Relation<User>;

  @Column({ name: 'approved_by_admin_user_id', type: 'uuid', nullable: true })
  approvedByAdminUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'approved_by_admin_user_id',
    foreignKeyConstraintName: 'FK_driver_settlements_approved_by',
  })
  approvedByAdminUser!: Relation<User> | null;

  @Column({ name: 'settled_by_admin_user_id', type: 'uuid', nullable: true })
  settledByAdminUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'settled_by_admin_user_id',
    foreignKeyConstraintName: 'FK_driver_settlements_settled_by',
  })
  settledByAdminUser!: Relation<User> | null;

  @Column({ name: 'cancelled_by_admin_user_id', type: 'uuid', nullable: true })
  cancelledByAdminUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'cancelled_by_admin_user_id',
    foreignKeyConstraintName: 'FK_driver_settlements_cancelled_by',
  })
  cancelledByAdminUser!: Relation<User> | null;

  @Column({
    name: 'transfer_reference',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  transferReference!: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  notes!: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @OneToMany(() => DriverSettlementItem, (item) => item.settlement)
  items!: Relation<DriverSettlementItem[]>;

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
