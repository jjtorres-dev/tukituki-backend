import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';
import { RideLocationResponseDto } from './passenger-ride-response.dto';

export class DriverActiveRideResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

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

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiPropertyOptional({ nullable: true })
  passengerNotes!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

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

  @ApiPropertyOptional({ nullable: true })
  distanceToOriginMeters!: number | null;
}
