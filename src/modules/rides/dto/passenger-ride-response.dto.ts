import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

export class PassengerRideResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  fareQuoteId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
  })
  driverProfileId!: string | null;

  @ApiProperty({
    enum: RideStatus,
  })
  status!: RideStatus;

  @ApiProperty({
    type: RideLocationResponseDto,
  })
  origin!: RideLocationResponseDto;

  @ApiProperty({
    type: RideLocationResponseDto,
  })
  destination!: RideLocationResponseDto;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty()
  estimatedDurationSeconds!: number;

  @ApiProperty()
  estimatedFare!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  finalFare!: string | null;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  passengerNotes!: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  requestedAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
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
  cancelledAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  cancellationReason!: string | null;

  @ApiPropertyOptional({
    enum: RideCancellationActor,
    nullable: true,
  })
  cancelledBy!: RideCancellationActor | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  createdAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  updatedAt!: Date;
}
