import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { RideShareLink } from './ride-share-link.entity';

@Entity({ name: 'ride_share_access_logs' })
@Index('IDX_ride_share_access_logs_link_accessed', [
  'shareLinkId',
  'accessedAt',
])
@Index('IDX_ride_share_access_logs_link_ip_accessed', [
  'shareLinkId',
  'ipHash',
  'accessedAt',
])
export class RideShareAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'share_link_id', type: 'uuid' })
  shareLinkId!: string;

  @ManyToOne(() => RideShareLink, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'share_link_id' })
  shareLink!: Relation<RideShareLink>;

  @Column({ name: 'ip_hash', type: 'char', length: 64 })
  ipHash!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'accessed_at', type: 'timestamptz' })
  accessedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
