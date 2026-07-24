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
import { UserRole } from '../../users/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { AdminAuditOutcome } from '../enums/admin-audit-outcome.enum';

@Check(
  'CHK_admin_audit_logs_status_code',
  '"response_status_code" BETWEEN 100 AND 599',
)
@Entity({ name: 'admin_audit_logs' })
@Index('IDX_admin_audit_logs_actor_occurred', ['actorUserId', 'occurredAt'])
@Index('IDX_admin_audit_logs_resource_occurred', [
  'resourceType',
  'resourceId',
  'occurredAt',
])
@Index('IDX_admin_audit_logs_outcome_occurred', ['outcome', 'occurredAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'actor_user_id',
    foreignKeyConstraintName: 'FK_admin_audit_logs_actor',
  })
  actorUser!: Relation<User>;

  @Column({ name: 'actor_roles', type: 'jsonb' })
  actorRoles!: UserRole[];

  @Column({ type: 'varchar', length: 180 })
  action!: string;

  @Column({ name: 'resource_type', type: 'varchar', length: 80 })
  resourceType!: string;

  @Column({
    name: 'resource_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  resourceId!: string | null;

  @Column({ name: 'http_method', type: 'varchar', length: 10 })
  httpMethod!: string;

  @Column({ type: 'varchar', length: 300 })
  route!: string;

  @Column({
    type: 'enum',
    enum: AdminAuditOutcome,
    enumName: 'admin_audit_outcome_enum',
  })
  outcome!: AdminAuditOutcome;

  @Column({ name: 'response_status_code', type: 'smallint' })
  responseStatusCode!: number;

  @Column({ name: 'request_id', type: 'varchar', length: 100 })
  @Index('IDX_admin_audit_logs_request_id')
  requestId!: string;

  @Column({ name: 'ip_hash', type: 'char', length: 64, nullable: true })
  ipHash!: string | null;

  @Column({
    name: 'user_agent',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
