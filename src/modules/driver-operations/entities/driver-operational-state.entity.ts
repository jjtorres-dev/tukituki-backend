import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';

import { DriverProfile } from '../../drivers/entities/driver-profile.entity';
import { DriverOperationalStatus } from '../enums/driver-operational-status.enum';

@Entity({
  name: 'driver_operational_states',
})
@Index('UQ_driver_operational_states_driver_profile_id', ['driverProfileId'], {
  unique: true,
})
@Index('IDX_driver_operational_states_status', ['status'])
@Index('IDX_driver_operational_states_last_seen_at', ['lastSeenAt'])
export class DriverOperationalState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    name: 'driver_profile_id',
    type: 'uuid',
  })
  driverProfileId!: string;

  @OneToOne(() => DriverProfile, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'driver_profile_id',
  })
  driverProfile!: Relation<DriverProfile>;

  @Column({
    type: 'enum',
    enum: DriverOperationalStatus,
    enumName: 'driver_operational_status_enum',
    default: DriverOperationalStatus.OFFLINE,
  })
  status!: DriverOperationalStatus;

  @Column({
    name: 'connected_at',
    type: 'timestamptz',
    nullable: true,
  })
  connectedAt!: Date | null;

  @Column({
    name: 'disconnected_at',
    type: 'timestamptz',
    nullable: true,
  })
  disconnectedAt!: Date | null;

  @Column({
    name: 'last_seen_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastSeenAt!: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
  })
  updatedAt!: Date;
}
