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

import { User } from '../../users/entities/user.entity';
import { FinancialObligationStatus } from '../enums/financial-obligation-status.enum';
import { FinancialObligationType } from '../enums/financial-obligation-type.enum';
import { RideCancellation } from './ride-cancellation.entity';
import { Ride } from './ride.entity';

@Entity({ name: 'user_financial_obligations' })
@Check('CHK_user_financial_obligations_amount', '"amount" >= 0')
@Index(
  'UQ_user_financial_obligations_source',
  ['userId', 'rideId', 'obligationType'],
  { unique: true },
)
@Index('IDX_user_financial_obligations_user_status_created', [
  'userId',
  'status',
  'createdAt',
])
export class UserFinancialObligation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'cancellation_id', type: 'uuid', nullable: true })
  cancellationId!: string | null;

  @ManyToOne(() => RideCancellation, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'cancellation_id' })
  cancellation!: Relation<RideCancellation> | null;

  @Column({
    name: 'obligation_type',
    type: 'enum',
    enum: FinancialObligationType,
    enumName: 'financial_obligation_type_enum',
  })
  obligationType!: FinancialObligationType;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({
    type: 'enum',
    enum: FinancialObligationStatus,
    enumName: 'financial_obligation_status_enum',
    default: FinancialObligationStatus.PENDING,
  })
  status!: FinancialObligationStatus;

  @Column({ name: 'source_reference', type: 'varchar', length: 200 })
  sourceReference!: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
