import { ApiProperty } from '@nestjs/swagger';

import { RideStatusActor } from '../../rides/enums/ride-status-actor.enum';
import { SafetyIncidentSeverity } from '../enums/safety-incident-severity.enum';
import { SafetyIncidentStatus } from '../enums/safety-incident-status.enum';
import { SafetyIncidentType } from '../enums/safety-incident-type.enum';

export class SafetyIncidentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ format: 'uuid' })
  reporterUserId!: string;

  @ApiProperty({ enum: RideStatusActor })
  reporterRole!: RideStatusActor;

  @ApiProperty({ enum: SafetyIncidentType })
  incidentType!: SafetyIncidentType;

  @ApiProperty({ enum: SafetyIncidentSeverity })
  severity!: SafetyIncidentSeverity;

  @ApiProperty({ enum: SafetyIncidentStatus })
  status!: SafetyIncidentStatus;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty({ type: Number, nullable: true })
  accuracy!: number | null;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  rideStatusSnapshot!: string;

  @ApiProperty({ type: Object })
  passengerSnapshot!: Record<string, unknown>;

  @ApiProperty({ type: Object, nullable: true })
  driverSnapshot!: Record<string, unknown> | null;

  @ApiProperty({ type: Object, nullable: true })
  vehicleSnapshot!: Record<string, unknown> | null;

  @ApiProperty({ type: String, nullable: true })
  acknowledgedByUserId!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  acknowledgedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  resolvedByUserId!: string | null;

  @ApiProperty({ type: Date, nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  resolutionNotes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class SafetyIncidentListResponseDto {
  @ApiProperty({ type: [SafetyIncidentResponseDto] })
  items!: SafetyIncidentResponseDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}
