import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashPaymentDisputeReason } from '../enums/cash-payment-dispute-reason.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { RidePaymentStatus } from '../enums/ride-payment-status.enum';

export class RidePaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ format: 'uuid' })
  passengerUserId!: string;

  @ApiProperty({ format: 'uuid' })
  driverProfileId!: string;

  @ApiProperty({ enum: PaymentMethod })
  method!: PaymentMethod;

  @ApiProperty({ enum: RidePaymentStatus })
  status!: RidePaymentStatus;

  @ApiProperty({ example: '8.50' })
  amountDue!: string;

  @ApiProperty()
  grossAmount!: string;

  @ApiProperty()
  discountAmount!: string;

  @ApiPropertyOptional({ nullable: true, example: '10.00' })
  cashReceived!: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1.50' })
  changeGiven!: string | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  confirmedByDriverUserId!: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  confirmedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  confirmationNotes!: string | null;

  @ApiPropertyOptional({ enum: CashPaymentDisputeReason, nullable: true })
  disputeReason!: CashPaymentDisputeReason | null;

  @ApiPropertyOptional({ nullable: true })
  disputeDetail!: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  disputedAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  resolvedByAdminUserId!: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  resolvedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  resolutionNotes!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class RidePaymentPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class RidePaymentListResponseDto {
  @ApiProperty({ type: RidePaymentResponseDto, isArray: true })
  items!: RidePaymentResponseDto[];

  @ApiProperty({ type: RidePaymentPaginationDto })
  pagination!: RidePaymentPaginationDto;
}
