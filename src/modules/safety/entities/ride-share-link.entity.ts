import {
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
import { RideShareLinkStatus } from '../enums/ride-share-link-status.enum';

@Entity({ name: 'ride_share_links' })
@Index('UQ_ride_share_links_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_ride_share_links_ride_status_expires', [
  'rideId',
  'status',
  'expiresAt',
])
@Index('IDX_ride_share_links_creator_created', ['createdByUserId', 'createdAt'])
export class RideShareLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: Relation<User>;

  @Column({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Column({
    type: 'enum',
    enum: RideShareLinkStatus,
    enumName: 'ride_share_link_status_enum',
    default: RideShareLinkStatus.ACTIVE,
  })
  status!: RideShareLinkStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'last_accessed_at', type: 'timestamptz', nullable: true })
  lastAccessedAt!: Date | null;

  @Column({ name: 'access_count', type: 'integer', default: 0 })
  accessCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
