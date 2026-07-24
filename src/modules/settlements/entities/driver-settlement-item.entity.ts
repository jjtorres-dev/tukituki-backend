import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { RideCommission } from '../../commissions/entities/ride-commission.entity';
import { CommissionCollectionMode } from '../../commissions/enums/commission-collection-mode.enum';
import { DriverSettlement } from './driver-settlement.entity';

@Entity({ name: 'driver_settlement_items' })
@Check(
  'CHK_driver_settlement_items_amounts',
  '"base_amount" >= 0 AND "commission_amount" >= 0 AND "driver_net_amount" >= 0',
)
@Check(
  'CHK_driver_settlement_items_effect',
  '("collection_mode" = \'DEDUCT_FROM_PAYOUT\' AND "net_effect_amount" = "driver_net_amount") OR ("collection_mode" = \'DRIVER_PAYABLE\' AND "net_effect_amount" = -"commission_amount")',
)
@Index('IDX_driver_settlement_items_settlement', ['settlementId'])
@Index('UQ_driver_settlement_items_active_commission', ['commissionId'], {
  unique: true,
  where: '"released_at" IS NULL',
})
export class DriverSettlementItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'settlement_id', type: 'uuid' })
  settlementId!: string;

  @ManyToOne(() => DriverSettlement, (settlement) => settlement.items, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'settlement_id',
    foreignKeyConstraintName: 'FK_driver_settlement_items_settlement',
  })
  settlement!: Relation<DriverSettlement>;

  @Column({ name: 'commission_id', type: 'uuid' })
  commissionId!: string;

  @ManyToOne(() => RideCommission, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'commission_id',
    foreignKeyConstraintName: 'FK_driver_settlement_items_commission',
  })
  commission!: Relation<RideCommission>;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @Column({
    name: 'collection_mode',
    type: 'enum',
    enum: CommissionCollectionMode,
    enumName: 'commission_collection_mode_enum',
  })
  collectionMode!: CommissionCollectionMode;

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

  @Column({
    name: 'net_effect_amount',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  netEffectAmount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'accrued_at', type: 'timestamptz' })
  accruedAt!: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
