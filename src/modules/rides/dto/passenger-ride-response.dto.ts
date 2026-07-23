import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VehicleType } from '../../drivers/enums/vehicle-type.enum';
import { RideCancellationActor } from '../enums/ride-cancellation-actor.enum';
import { RideStatus } from '../enums/ride-status.enum';

export class RideLocationResponseDto {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  address!: string;
}

export class AssignedDriverVehicleResponseDto {
  @ApiProperty()
  plate!: string;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  model!: string;

  @ApiProperty()
  color!: string;

  @ApiProperty({ enum: VehicleType })
  vehicleType!: VehicleType;
}

export class AssignedDriverResponseDto {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: AssignedDriverVehicleResponseDto })
  vehicle!: AssignedDriverVehicleResponseDto;
}

export class AssignedDriverLocationResponseDto {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiPropertyOptional({ nullable: true })
  heading!: number | null;

  @ApiPropertyOptional({ nullable: true })
  speed!: number | null;

  @ApiPropertyOptional({ nullable: true })
  accuracy!: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  recordedAt!: Date;
}

export class PassengerRideResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  fareQuoteId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  driverProfileId!: string | null;

  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  stateVersion!: number;

  @ApiProperty({ type: RideLocationResponseDto })
  origin!: RideLocationResponseDto;

  @ApiProperty({ type: RideLocationResponseDto })
  destination!: RideLocationResponseDto;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty()
  estimatedDurationSeconds!: number;

  @ApiProperty()
  estimatedFare!: string;

  @ApiPropertyOptional({ nullable: true })
  finalFare!: string | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiPropertyOptional({ nullable: true })
  passengerNotes!: string | null;

  @ApiPropertyOptional({
    type: AssignedDriverResponseDto,
    nullable: true,
  })
  driver!: AssignedDriverResponseDto | null;

  @ApiPropertyOptional({
    type: AssignedDriverLocationResponseDto,
    nullable: true,
  })
  driverLocation!: AssignedDriverLocationResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  searchExpiresAt!: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  driverAssignedAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  driverArrivingAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  driverArrivedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  arrivalDistanceMeters!: string | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  cancellationReason!: string | null;

  @ApiPropertyOptional({
    enum: RideCancellationActor,
    nullable: true,
  })
  cancelledBy!: RideCancellationActor | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
