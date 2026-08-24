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
import { VehicleOwnership } from '../enums/vehicle-ownership.enum';
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

  /*
   * Opcional (DRIVER-ONBOARDING-R2): el onboarding nuevo ya no pide
   * motor manualmente. Nullable en DB; expedientes legacy conservan
   * su valor.
   */
  @Column({
    name: 'engine_number',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  engineNumber!: string | null;

  /*
   * Opcional (DRIVER-ONBOARDING-R2): el onboarding nuevo ya no pide
   * chasis manualmente. Nullable en DB; expedientes legacy conservan
   * su valor.
   */
  @Column({
    name: 'chassis_number',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  chassisNumber!: string | null;

  /*
   * Nullable en DB por compatibilidad con vehículos existentes en
   * STAGING (creados antes de DRIVER-ONBOARDING-R2, sin ownership
   * conocido — no se inventa un valor para ellos). El DTO de creación
   * sí lo exige para vehículos nuevos.
   */
  @Column({
    type: 'enum',
    enum: VehicleOwnership,
    enumName: 'vehicle_ownership_enum',
    nullable: true,
  })
  ownership!: VehicleOwnership | null;

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
