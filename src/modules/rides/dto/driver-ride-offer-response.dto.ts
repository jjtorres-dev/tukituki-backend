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

  /*
   * Precio sugerido por TukiTuki.
   * Es informativo para el conductor.
   */
  @ApiProperty({
    example: '5.00',
  })
  estimatedFare!: string;

  /*
   * Precio inicial con el que el pasajero
   * creó la solicitud de viaje.
   */
  @ApiProperty({
    example: '5.50',
  })
  initialPassengerOfferFare!: string;

  /*
   * Precio vigente que el pasajero ofrece
   * a este conductor.
   */
  @ApiProperty({
    example: '5.75',
  })
  passengerOfferFare!: string;

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

  /*
   * Último precio presentado por este conductor.
   *
   * NULL mientras todavía no responda por primera vez.
   */
  @ApiPropertyOptional({
    nullable: true,
    example: '6.00',
  })
  proposedFare!: string | null;

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
  proposedAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  passengerProposedAt!: Date | null;

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
