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

export interface DriverLocationPoint {
  type: 'Point';
  coordinates: [number, number];
}

@Entity({
  name: 'driver_locations',
})
@Index('UQ_driver_locations_driver_profile_id', ['driverProfileId'], {
  unique: true,
})
@Index('IDX_driver_locations_recorded_at', ['recordedAt'])
export class DriverLocation {
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

  @Index('IDX_driver_locations_position', {
    spatial: true,
  })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  position!: DriverLocationPoint;

  @Column({
    type: 'double precision',
  })
  latitude!: number;

  @Column({
    type: 'double precision',
  })
  longitude!: number;

  @Column({
    type: 'double precision',
    nullable: true,
  })
  heading!: number | null;

  @Column({
    type: 'double precision',
    nullable: true,
  })
  speed!: number | null;

  @Column({
    type: 'double precision',
    nullable: true,
  })
  accuracy!: number | null;

  @Column({
    name: 'recorded_at',
    type: 'timestamptz',
  })
  recordedAt!: Date;

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
