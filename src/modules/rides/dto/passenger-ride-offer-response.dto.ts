import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideOfferStatus } from '../enums/ride-offer-status.enum';

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
    enum: RideOfferStatus,
  })
  status!: RideOfferStatus;

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
   * Precio inicial con el que el pasajero
   * creó la solicitud de viaje.
   */
  @ApiProperty({
    example: '5.50',
  })
  initialPassengerOfferFare!: string;

  /*
   * Precio vigente que el pasajero ofrece
   * específicamente a este conductor.
   */
  @ApiProperty({
    example: '5.75',
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
   * el conductor pidió más dinero.
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

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  passengerProposedAt!: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: Date;
}
