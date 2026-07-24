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

import { RidePayment } from './ride-payment.entity';
import { DigitalPaymentAttemptStatus } from '../enums/digital-payment-attempt-status.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentProvider } from '../enums/payment-provider.enum';

@Entity({ name: 'digital_payment_attempts' })
@Check('CHK_digital_payment_attempts_amount', '"amount" >= 0')
@Index('UQ_digital_payment_attempts_transaction', ['transactionId'], {
  unique: true,
})
@Index('UQ_digital_payment_attempts_order', ['orderNumber'], { unique: true })
@Index(
  'UQ_digital_payment_attempts_payment_idempotency',
  ['paymentId', 'idempotencyKey'],
  { unique: true },
)
@Index('IDX_digital_payment_attempts_payment_created', [
  'paymentId',
  'createdAt',
])
@Index('IDX_digital_payment_attempts_status_created', ['status', 'createdAt'])
export class DigitalPaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'payment_id', type: 'uuid' })
  paymentId!: string;

  @ManyToOne(() => RidePayment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'payment_id',
    foreignKeyConstraintName: 'FK_digital_payment_attempts_payment',
  })
  payment!: Relation<RidePayment>;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    enumName: 'payment_provider_enum',
  })
  provider!: PaymentProvider;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method_enum',
  })
  method!: PaymentMethod;

  @Column({
    type: 'enum',
    enum: DigitalPaymentAttemptStatus,
    enumName: 'digital_payment_attempt_status_enum',
    default: DigitalPaymentAttemptStatus.CREATED,
  })
  status!: DigitalPaymentAttemptStatus;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @Column({ name: 'transaction_id', type: 'varchar', length: 40 })
  transactionId!: string;

  @Column({ name: 'order_number', type: 'varchar', length: 40 })
  orderNumber!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  @Column({ name: 'session_expires_at', type: 'timestamptz', nullable: true })
  sessionExpiresAt!: Date | null;

  @Column({
    name: 'provider_authorization_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerAuthorizationCode!: string | null;

  @Column({
    name: 'provider_reference_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerReferenceNumber!: string | null;

  @Column({
    name: 'provider_unique_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerUniqueId!: string | null;

  @Column({
    name: 'provider_state_message',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  providerStateMessage!: string | null;

  @Column({
    name: 'failure_code',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  failureCode!: string | null;

  @Column({
    name: 'failure_message',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  failureMessage!: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
