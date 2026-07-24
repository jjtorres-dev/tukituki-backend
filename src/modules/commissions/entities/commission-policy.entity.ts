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

@Entity({ name: 'commission_policies' })
@Check('CHK_commission_policies_rate', '"rate_bps" BETWEEN 300 AND 500')
@Check(
  'CHK_commission_policies_effective_range',
  '"effective_until" IS NULL OR "effective_until" > "effective_from"',
)
@Index('UQ_commission_policies_code', ['code'], { unique: true })
@Index('IDX_commission_policies_effective', ['effectiveFrom', 'effectiveUntil'])
export class CommissionPolicy {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80 })
  code!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ name: 'rate_bps', type: 'smallint' })
  rateBps!: number;

  @Column({ name: 'effective_from', type: 'timestamptz' })
  effectiveFrom!: Date;

  @Column({ name: 'effective_until', type: 'timestamptz', nullable: true })
  effectiveUntil!: Date | null;

  @Column({ name: 'created_by_admin_user_id', type: 'uuid', nullable: true })
  createdByAdminUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'created_by_admin_user_id',
    foreignKeyConstraintName: 'FK_commission_policies_created_by',
  })
  createdByAdminUser!: Relation<User> | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
