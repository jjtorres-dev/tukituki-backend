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

import { User } from '../../users/entities/user.entity';
import { RideStatusActor } from '../enums/ride-status-actor.enum';
import { RideStatus } from '../enums/ride-status.enum';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_status_history' })
@Index('IDX_ride_status_history_ride_occurred_at', ['rideId', 'occurredAt'])
@Index('IDX_ride_status_history_new_status', ['newStatus'])
export class RideStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({
    name: 'previous_status',
    type: 'enum',
    enum: RideStatus,
    enumName: 'ride_status_enum',
    nullable: true,
  })
  previousStatus!: RideStatus | null;

  @Column({
    name: 'new_status',
    type: 'enum',
    enum: RideStatus,
    enumName: 'ride_status_enum',
  })
  newStatus!: RideStatus;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: RideStatusActor,
    enumName: 'ride_status_actor_enum',
  })
  actorType!: RideStatusActor;

  @Column({
    name: 'actor_user_id',
    type: 'uuid',
    nullable: true,
  })
  actorUserId!: string | null;

  @ManyToOne(() => User, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'actor_user_id' })
  actorUser!: Relation<User> | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
