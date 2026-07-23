import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'cancellation_policies' })
@Check(
  'CHK_cancellation_policies_amounts',
  '"passenger_assigned_fee" >= 0 AND "passenger_arriving_fee" >= 0 AND "passenger_arrived_fee" >= 0 AND "passenger_no_show_fee" >= 0 AND "driver_no_show_compensation" >= 0',
)
@Check(
  'CHK_cancellation_policies_seconds',
  '"passenger_grace_period_seconds" >= 0 AND "driver_arrival_wait_seconds" > 0 AND "driver_no_progress_seconds" > 0 AND "driver_no_progress_min_meters" >= 0',
)
@Check(
  'CHK_cancellation_policies_effective_range',
  '"effective_until" IS NULL OR "effective_until" > "effective_from"',
)
@Index('UQ_cancellation_policies_code', ['code'], { unique: true })
@Index('IDX_cancellation_policies_active_effective', [
  'isActive',
  'effectiveFrom',
  'effectiveUntil',
])
export class CancellationPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'char', length: 3, default: 'PEN' })
  currency!: string;

  @Column({ name: 'passenger_grace_period_seconds', type: 'integer' })
  passengerGracePeriodSeconds!: number;

  @Column({
    name: 'passenger_assigned_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  passengerAssignedFee!: string;

  @Column({
    name: 'passenger_arriving_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  passengerArrivingFee!: string;

  @Column({
    name: 'passenger_arrived_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  passengerArrivedFee!: string;

  @Column({
    name: 'passenger_no_show_fee',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  passengerNoShowFee!: string;

  @Column({
    name: 'driver_no_show_compensation',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  driverNoShowCompensation!: string;

  @Column({ name: 'driver_arrival_wait_seconds', type: 'integer' })
  driverArrivalWaitSeconds!: number;

  @Column({ name: 'driver_no_progress_seconds', type: 'integer' })
  driverNoProgressSeconds!: number;

  @Column({ name: 'driver_no_progress_min_meters', type: 'integer' })
  driverNoProgressMinMeters!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_until', type: 'timestamptz', nullable: true })
  effectiveUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
