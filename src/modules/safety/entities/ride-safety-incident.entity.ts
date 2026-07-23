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
import { RideStatusActor } from '../../rides/enums/ride-status-actor.enum';
import { User } from '../../users/entities/user.entity';
import { SafetyIncidentSeverity } from '../enums/safety-incident-severity.enum';
import { SafetyIncidentStatus } from '../enums/safety-incident-status.enum';
import { SafetyIncidentType } from '../enums/safety-incident-type.enum';

export interface SafetyIncidentPoint {
  type: 'Point';
  coordinates: [number, number];
}

@Entity({ name: 'ride_safety_incidents' })
@Index('IDX_ride_safety_incidents_ride_created_at', ['rideId', 'createdAt'])
@Index('IDX_ride_safety_incidents_status_severity_created', [
  'status',
  'severity',
  'createdAt',
])
export class RideSafetyIncident {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ride_id', type: 'uuid' })
  rideId!: string;

  @ManyToOne(() => Ride, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ride_id' })
  ride!: Relation<Ride>;

  @Column({ name: 'reporter_user_id', type: 'uuid' })
  reporterUserId!: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reporter_user_id' })
  reporterUser!: Relation<User>;

  @Column({
    name: 'reporter_role',
    type: 'enum',
    enum: RideStatusActor,
    enumName: 'ride_status_actor_enum',
  })
  reporterRole!: RideStatusActor;

  @Column({
    name: 'incident_type',
    type: 'enum',
    enum: SafetyIncidentType,
    enumName: 'safety_incident_type_enum',
  })
  incidentType!: SafetyIncidentType;

  @Column({
    type: 'enum',
    enum: SafetyIncidentSeverity,
    enumName: 'safety_incident_severity_enum',
  })
  severity!: SafetyIncidentSeverity;

  @Column({
    type: 'enum',
    enum: SafetyIncidentStatus,
    enumName: 'safety_incident_status_enum',
    default: SafetyIncidentStatus.OPEN,
  })
  status!: SafetyIncidentStatus;

  @Index('IDX_ride_safety_incidents_position', { spatial: true })
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
  })
  position!: SafetyIncidentPoint;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  @Column({ type: 'double precision', nullable: true })
  accuracy!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ name: 'ride_status_snapshot', type: 'varchar', length: 40 })
  rideStatusSnapshot!: string;

  @Column({ name: 'passenger_snapshot', type: 'jsonb' })
  passengerSnapshot!: Record<string, unknown>;

  @Column({ name: 'driver_snapshot', type: 'jsonb', nullable: true })
  driverSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'vehicle_snapshot', type: 'jsonb', nullable: true })
  vehicleSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'acknowledged_by_user_id', type: 'uuid', nullable: true })
  acknowledgedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'acknowledged_by_user_id' })
  acknowledgedByUser!: Relation<User> | null;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'resolved_by_user_id', type: 'uuid', nullable: true })
  resolvedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_user_id' })
  resolvedByUser!: Relation<User> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({
    name: 'resolution_notes',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  resolutionNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
