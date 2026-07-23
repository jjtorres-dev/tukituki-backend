import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CancellationFeeStatus } from '../enums/cancellation-fee-status.enum';
import { RideCancellationActor } from '../enums/ride-cancellation-actor.enum';
import { RideCancellationType } from '../enums/ride-cancellation-type.enum';
import { PassengerCancellationReason } from '../enums/passenger-cancellation-reason.enum';
import { RideStatus } from '../enums/ride-status.enum';

export class PassengerCancellationPreviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus })
  rideStatus!: RideStatus;

  @ApiProperty()
  canCancel!: boolean;

  @ApiProperty()
  gracePeriodExpired!: boolean;

  @ApiProperty({ example: '2.00' })
  calculatedFee!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ enum: PassengerCancellationReason })
  reason!: PassengerCancellationReason;

  @ApiProperty()
  requiresConfirmation!: boolean;
}

export class RideCancellationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus })
  rideStatusBefore!: RideStatus;

  @ApiProperty({ enum: RideStatus, example: RideStatus.CANCELLED })
  status!: RideStatus;

  @ApiProperty({ enum: RideCancellationActor })
  actorType!: RideCancellationActor;

  @ApiProperty({ enum: RideCancellationType })
  cancellationType!: RideCancellationType;

  @ApiProperty()
  reasonCode!: string;

  @ApiPropertyOptional({ nullable: true })
  reasonDetail!: string | null;

  @ApiProperty({ example: '2.00' })
  calculatedFee!: string;

  @ApiProperty({ example: '2.00' })
  chargedFee!: string;

  @ApiProperty({ example: '0.00' })
  waivedAmount!: string;

  @ApiProperty({ enum: CancellationFeeStatus })
  feeStatus!: CancellationFeeStatus;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiPropertyOptional({ nullable: true, example: '12.45' })
  distanceToReferenceMeters!: string | null;

  @ApiPropertyOptional({ nullable: true })
  waitingSeconds!: number | null;

  @ApiProperty()
  stateVersion!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  cancelledAt!: Date;
}

export class RideCancellationPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}

export class RideCancellationListResponseDto {
  @ApiProperty({ type: [RideCancellationResponseDto] })
  items!: RideCancellationResponseDto[];

  @ApiProperty({ type: RideCancellationPaginationDto })
  pagination!: RideCancellationPaginationDto;
}
