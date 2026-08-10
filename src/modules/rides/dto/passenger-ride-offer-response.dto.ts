import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PassengerRideOfferDriverDto {
  @ApiProperty({
    format: 'uuid',
  })
  profileId!: string;

  @ApiProperty({
    example: 'Carlos',
  })
  firstName!: string;

  /*
   * Antes de elegir conductor no exponemos
   * el apellido completo.
   *
   * Ejemplo:
   * Mendoza -> M.
   */
  @ApiProperty({
    example: 'M.',
  })
  lastNameInitial!: string;

  @ApiPropertyOptional({
    nullable: true,
  })
  photoUrl!: string | null;

  @ApiProperty({
    example: '4.92',
  })
  ratingAverage!: string;

  @ApiProperty({
    example: 128,
  })
  ratingCount!: number;
}

export class PassengerRideOfferResponseDto {
  @ApiProperty({
    format: 'uuid',
  })
  offerId!: string;

  @ApiProperty({
    format: 'uuid',
  })
  rideId!: string;

  @ApiProperty({
    type: PassengerRideOfferDriverDto,
  })
  driver!: PassengerRideOfferDriverDto;

  @ApiProperty({
    example: 320,
    description:
      'Distancia aproximada en metros entre el conductor y el origen.',
  })
  distanceToOriginMeters!: number;

  /*
   * Precio inicial que había ofrecido
   * el pasajero.
   */
  @ApiProperty({
    example: '5.50',
  })
  passengerOfferFare!: string;

  /*
   * Precio que propone este conductor.
   */
  @ApiProperty({
    example: '6.00',
  })
  proposedFare!: string;

  /*
   * true:
   * el conductor propuso un precio distinto.
   *
   * false:
   * aceptó exactamente el precio
   * ofrecido por el pasajero.
   */
  @ApiProperty({
    example: true,
  })
  isCounterOffer!: boolean;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  proposedAt!: Date;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: Date;
}
