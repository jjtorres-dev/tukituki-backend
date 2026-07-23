import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideOfferStatus } from '../enums/ride-offer-status.enum';

export class DriverRideOfferLocationDto {
  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  address!: string;
}

export class DriverRideOfferRideDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    type: DriverRideOfferLocationDto,
  })
  origin!: DriverRideOfferLocationDto;

  @ApiProperty({
    type: DriverRideOfferLocationDto,
  })
  destination!: DriverRideOfferLocationDto;

  @ApiProperty()
  estimatedFare!: string;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  passengerNotes!: string | null;
}

export class DriverRideOfferResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  id!: string;

  @ApiProperty({
    format: 'uuid',
  })
  rideId!: string;

  @ApiProperty({
    enum: RideOfferStatus,
  })
  status!: RideOfferStatus;

  @ApiProperty()
  distanceToOriginMeters!: number;

  @ApiProperty()
  dispatchRound!: number;

  @ApiProperty()
  searchRadiusMeters!: number;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  offeredAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  respondedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
  })
  rejectionReason!: string | null;

  @ApiProperty({
    type: DriverRideOfferRideDto,
  })
  ride!: DriverRideOfferRideDto;
}
