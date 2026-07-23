import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Ride } from './ride.entity';

@Entity({ name: 'ride_waitings' })
@Index('UQ_ride_waitings_ride_id', ['rideId'], { unique: true })
@Index('IDX_ride_waitings_no_show_available_at', ['noShowAvailableAt'])
export class RideWaiting {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @OneToOne(() => Ride, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'started_by_driver_user_id', type: 'uuid' })
  startedByDriverUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'started_by_driver_user_id' })
  startedByDriverUser!: Relation<User>;

  @Column({ name: 'waiting_started_at', type: 'timestamptz' })
  waitingStartedAt!: Date;

  @Column({ name: 'no_show_available_at', type: 'timestamptz' })
  noShowAvailableAt!: Date;

  @Column({ name: 'required_waiting_seconds', type: 'integer' })
  requiredWaitingSeconds!: number;

  @Column({
    name: 'start_distance_meters',
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  startDistanceMeters!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
