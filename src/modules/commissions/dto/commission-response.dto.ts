import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { CommissionCollectionMode } from '../enums/commission-collection-mode.enum';
import { RideCommissionStatus } from '../enums/ride-commission-status.enum';

export class CommissionPolicyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ example: 500 })
  rateBps!: number;

  @ApiProperty({ example: '5.00' })
  ratePercent!: string;

  @ApiProperty({ type: Date })
  effectiveFrom!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  effectiveUntil!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;
}

export class RideCommissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ format: 'uuid' })
  paymentId!: string;

  @ApiProperty({ format: 'uuid' })
  driverProfileId!: string;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiProperty({ enum: CommissionCollectionMode })
  collectionMode!: CommissionCollectionMode;

  @ApiProperty({ enum: RideCommissionStatus })
  status!: RideCommissionStatus;

  @ApiProperty({ example: 500 })
  rateBps!: number;

  @ApiProperty({ example: '5.00' })
  ratePercent!: string;

  @ApiProperty({ example: '10.00' })
  baseAmount!: string;

  @ApiProperty({ example: '0.50' })
  commissionAmount!: string;

  @ApiProperty({ example: '9.50' })
  driverNetAmount!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ type: Date })
  accruedAt!: Date;

  @ApiProperty({ type: Date })
  eligibleAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  heldAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  settledAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  reversedAt!: Date | null;
}

export class CommissionListResponseDto {
  @ApiProperty({ type: [RideCommissionResponseDto] })
  items!: RideCommissionResponseDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class CommissionSummaryResponseDto {
  @ApiProperty({ example: 25 })
  rideCount!: number;

  @ApiProperty({ example: '250.00' })
  grossFare!: string;

  @ApiProperty({ example: '12.50' })
  platformCommission!: string;

  @ApiProperty({ example: '237.50' })
  driverNet!: string;

  @ApiProperty({
    example: '4.00',
    description: 'Comisión por efectivo que el conductor debe a TukiTuki.',
  })
  cashCommissionReceivable!: string;

  @ApiProperty({
    example: '161.50',
    description: 'Neto digital aún pendiente de liquidar al conductor.',
  })
  digitalNetPayable!: string;

  @ApiProperty({ example: '1.00' })
  heldCommission!: string;

  @ApiProperty({ example: '0.50' })
  reversedCommission!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;
}
