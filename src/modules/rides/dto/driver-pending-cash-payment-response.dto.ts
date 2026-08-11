import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RidePaymentResponseDto } from '../../payments/dto/ride-payment-response.dto';
import { RideStatus } from '../enums/ride-status.enum';

/**
 * Resumen mínimo de un Ride COMPLETED con RidePayment todavía sin
 * confirmar, suficiente para que el Driver reabra la pantalla de
 * cobro sin volver a traer la entidad Ride completa.
 */
export class DriverPendingCashPaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus })
  rideStatus!: RideStatus;

  @ApiProperty()
  originAddress!: string;

  @ApiProperty()
  destinationAddress!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  finalFare!: string | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ type: RidePaymentResponseDto })
  payment!: RidePaymentResponseDto;
}
