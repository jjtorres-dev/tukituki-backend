import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { ServiceZoneStatus } from '../enums/service-zone-status.enum';

export interface ServiceZoneBoundary {
  type: 'Polygon';
  coordinates: number[][][];
}

@Entity({
  name: 'service_zones',
})
@Index('UQ_service_zones_code', ['code'], {
  unique: true,
})
@Index('IDX_service_zones_status_priority', ['status', 'priority'])
export class ServiceZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'varchar',
    length: 120,
  })
  name!: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  code!: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  description!: string | null;

  @Index('IDX_service_zones_boundary', {
    spatial: true,
  })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Polygon',
    srid: 4326,
  })
  boundary!: ServiceZoneBoundary;

  @Column({
    type: 'enum',
    enum: ServiceZoneStatus,
    enumName: 'service_zone_status_enum',
    default: ServiceZoneStatus.INACTIVE,
  })
  status!: ServiceZoneStatus;

  @Column({
    type: 'integer',
    default: 0,
  })
  priority!: number;

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
