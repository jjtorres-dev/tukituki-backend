import { ApiProperty } from '@nestjs/swagger';

import { RideOfferStatus } from '../enums/ride-offer-status.enum';
import { DriverRideOfferLocationDto } from './driver-ride-offer-response.dto';

/*
 * Respuesta de GET /drivers/me/ride-offers/proposals/pending.
 *
 * Recuperación autoritativa de propuestas PROPOSED vigentes,
 * pensada para que Flutter pueda reconstruir la negociación
 * tras un restart sin depender de estado local.
 */
export class DriverPendingProposalResponseDto {
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
    enumName: 'RideOfferStatus',
  })
  status!: RideOfferStatus.PROPOSED;

  @ApiProperty({
    example: '4.50',
  })
  proposedFare!: string;

  @ApiProperty({
    example: '4.00',
  })
  passengerOfferFare!: string;

  @ApiProperty({
    example: '5.99',
  })
  estimatedFare!: string;

  @ApiProperty({
    example: 'PEN',
  })
  currency!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
  })
  expiresAt!: Date;

  @ApiProperty({
    type: DriverRideOfferLocationDto,
  })
  origin!: DriverRideOfferLocationDto;

  @ApiProperty({
    type: DriverRideOfferLocationDto,
  })
  destination!: DriverRideOfferLocationDto;

  @ApiProperty()
  distanceToOriginMeters!: number;
}
