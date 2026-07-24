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

import { Ride } from '../../rides/entities/ride.entity';
import { User } from '../../users/entities/user.entity';
import { PromotionDiscountType } from '../enums/promotion-discount-type.enum';
import { PromotionRedemptionStatus } from '../enums/promotion-redemption-status.enum';
import { Promotion } from './promotion.entity';

@Entity({ name: 'promotion_redemptions' })
@Check(
  'CHK_promotion_redemptions_amounts',
  '"estimated_fare" >= 0 AND "estimated_discount" >= 0 AND ("final_fare" IS NULL OR "final_fare" >= 0) AND ("final_discount" IS NULL OR "final_discount" >= 0)',
)
@Index('UQ_promotion_redemptions_ride', ['rideId'], { unique: true })
@Index('IDX_promotion_redemptions_promotion_status', ['promotionId', 'status'])
@Index('IDX_promotion_redemptions_passenger_status', [
  'passengerUserId',
  'status',
])
export class PromotionRedemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'promotion_id', type: 'uuid' })
  promotionId!: string;

  @ManyToOne(() => Promotion, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'promotion_id' })
  promotion!: Relation<Promotion>;

  @Column({ name: 'passenger_user_id', type: 'uuid' })
  passengerUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'passenger_user_id' })
  passengerUser!: Relation<User>;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'code_snapshot', type: 'varchar', length: 30 })
  codeSnapshot!: string;

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

  @Column({ name: 'estimated_fare', type: 'numeric', precision: 10, scale: 2 })
  estimatedFare!: string;

  @Column({
    name: 'estimated_discount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  estimatedDiscount!: string;

  @Column({
    name: 'final_fare',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  finalFare!: string | null;

  @Column({
    name: 'final_discount',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
  })
  finalDiscount!: string | null;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: PromotionRedemptionStatus,
    enumName: 'promotion_redemption_status_enum',
    default: PromotionRedemptionStatus.RESERVED,
  })
  status!: PromotionRedemptionStatus;

  @Column({ name: 'reserved_at', type: 'timestamptz' })
  reservedAt!: Date;

  @Column({ name: 'applied_at', type: 'timestamptz', nullable: true })
  appliedAt!: Date | null;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;

  @Column({
    name: 'release_reason',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  releaseReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
