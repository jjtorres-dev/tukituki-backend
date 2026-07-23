import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';

export class RideReceiptFareDto {
  @ApiProperty({ example: '2.50' })
  baseFare!: string;

  @ApiProperty({ example: '3.51' })
  distanceAmount!: string;

  @ApiProperty({ example: '1.30' })
  timeAmount!: string;

  @ApiProperty({ example: '0.50' })
  bookingFee!: string;

  @ApiProperty({ example: '7.81' })
  subtotal!: string;

  @ApiProperty({ example: '1.000' })
  adjustmentMultiplier!: string;

  @ApiProperty({ example: '7.81' })
  calculatedFinalFare!: string;

  @ApiProperty({ example: '7.81' })
  finalFare!: string;

  @ApiProperty({ example: '8.88' })
  fareCapAmount!: string;

  @ApiProperty({ example: false })
  fareWasCapped!: boolean;

  @ApiProperty({ example: 'PEN' })
  currency!: string;
}

export class RideReceiptResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus, example: RideStatus.COMPLETED })
  status!: RideStatus;

  @ApiProperty({ example: 'Jr. Lima 250, Tarapoto' })
  originAddress!: string;

  @ApiProperty({ example: 'Plaza de Armas de Morales' })
  destinationAddress!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: Date;

  @ApiProperty({ example: 3512 })
  actualDistanceMeters!: number;

  @ApiProperty({ example: 780 })
  actualDurationSeconds!: number;

  @ApiProperty({ example: '7.40' })
  estimatedFare!: string;

  @ApiPropertyOptional({ nullable: true, example: 'Entrada principal' })
  completionNotes!: string | null;

  @ApiProperty({ type: RideReceiptFareDto })
  fare!: RideReceiptFareDto;
}
