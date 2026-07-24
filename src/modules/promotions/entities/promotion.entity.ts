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
  VersionColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { PromotionDiscountType } from '../enums/promotion-discount-type.enum';
import { PromotionStatus } from '../enums/promotion-status.enum';

@Entity({ name: 'promotions' })
@Check(
  'CHK_promotions_discount',
  '("discount_type" = \'PERCENTAGE\' AND "discount_bps" BETWEEN 1 AND 10000 AND "fixed_amount" IS NULL) OR ("discount_type" = \'FIXED_AMOUNT\' AND "fixed_amount" > 0 AND "discount_bps" IS NULL)',
)
@Check('CHK_promotions_period', '"ends_at" > "starts_at"')
@Check(
  'CHK_promotions_limits',
  '"minimum_fare_amount" >= 0 AND ("maximum_discount_amount" IS NULL OR "maximum_discount_amount" > 0) AND ("total_usage_limit" IS NULL OR "total_usage_limit" > 0) AND "per_passenger_limit" > 0',
)
@Index('UQ_promotions_code', ['code'], { unique: true })
@Index('IDX_promotions_status_period', ['status', 'startsAt', 'endsAt'])
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: PromotionDiscountType,
    enumName: 'promotion_discount_type_enum',
  })
  discountType!: PromotionDiscountType;

  @Column({ name: 'discount_bps', type: 'smallint', nullable: true })
  discountBps!: number | null;

  @Column({
    name: 'fixed_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  fixedAmount!: string | null;

  @Column({
    name: 'maximum_discount_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  maximumDiscountAmount!: string | null;

  @Column({
    name: 'minimum_fare_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  minimumFareAmount!: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  currency!: string;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt!: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt!: Date;

  @Column({ name: 'total_usage_limit', type: 'integer', nullable: true })
  totalUsageLimit!: number | null;

  @Column({ name: 'per_passenger_limit', type: 'smallint', default: 1 })
  perPassengerLimit!: number;

  @Column({ name: 'first_ride_only', type: 'boolean', default: false })
  firstRideOnly!: boolean;

  @Column({
    type: 'enum',
    enum: PromotionStatus,
    enumName: 'promotion_status_enum',
    default: PromotionStatus.PAUSED,
  })
  status!: PromotionStatus;

  @Column({ name: 'created_by_admin_user_id', type: 'uuid' })
  createdByAdminUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_admin_user_id' })
  createdByAdminUser!: Relation<User>;

  @Column({ name: 'updated_by_admin_user_id', type: 'uuid' })
  updatedByAdminUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'updated_by_admin_user_id' })
  updatedByAdminUser!: Relation<User>;

  @VersionColumn({ type: 'integer', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
