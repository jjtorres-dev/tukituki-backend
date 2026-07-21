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

import { DriverProfile } from './driver-profile.entity';
import { VehicleStatus } from '../enums/vehicle-status.enum';
import { VehicleType } from '../enums/vehicle-type.enum';

@Entity({
  name: 'driver_vehicles',
})
@Index('UQ_driver_vehicles_driver_profile_id', ['driverProfileId'], {
  unique: true,
})
@Index('UQ_driver_vehicles_plate', ['plate'], {
  unique: true,
})
@Index('UQ_driver_vehicles_engine_number', ['engineNumber'], {
  unique: true,
})
@Index('UQ_driver_vehicles_chassis_number', ['chassisNumber'], {
  unique: true,
})
@Index('IDX_driver_vehicles_status', ['status'])
export class DriverVehicle {
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
    type: 'varchar',
    length: 15,
  })
  plate!: string;

  @Column({
    type: 'varchar',
    length: 80,
  })
  brand!: string;

  @Column({
    type: 'varchar',
    length: 80,
  })
  model!: string;

  @Column({
    type: 'smallint',
  })
  year!: number;

  @Column({
    type: 'varchar',
    length: 50,
  })
  color!: string;

  @Column({
    name: 'engine_number',
    type: 'varchar',
    length: 80,
  })
  engineNumber!: string;

  @Column({
    name: 'chassis_number',
    type: 'varchar',
    length: 80,
  })
  chassisNumber!: string;

  @Column({
    name: 'vehicle_type',
    type: 'enum',
    enum: VehicleType,
    enumName: 'vehicle_type_enum',
    default: VehicleType.MOTOTAXI,
  })
  vehicleType!: VehicleType;

  @Column({
    type: 'enum',
    enum: VehicleStatus,
    enumName: 'vehicle_status_enum',
    default: VehicleStatus.DRAFT,
  })
  status!: VehicleStatus;

  @Column({
    name: 'rejection_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  rejectionReason!: string | null;

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
