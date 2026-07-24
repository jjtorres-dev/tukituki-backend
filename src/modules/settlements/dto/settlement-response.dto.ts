import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CommissionCollectionMode } from '../../commissions/enums/commission-collection-mode.enum';
import { SettlementDirection } from '../enums/settlement-direction.enum';
import { SettlementStatus } from '../enums/settlement-status.enum';

export class DriverSettlementResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  driverProfileId!: string;

  @ApiProperty({ enum: SettlementStatus })
  status!: SettlementStatus;

  @ApiProperty({ enum: SettlementDirection })
  direction!: SettlementDirection;

  @ApiProperty({ type: Date })
  periodStart!: Date;

  @ApiProperty({ type: Date })
  periodEnd!: Date;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ example: 12 })
  rideCount!: number;

  @ApiProperty({ example: '120.00' })
  grossFareAmount!: string;

  @ApiProperty({ example: '6.00' })
  platformCommissionAmount!: string;

  @ApiProperty({ example: '76.00' })
  digitalNetAmount!: string;

  @ApiProperty({ example: '2.00' })
  cashCommissionAmount!: string;

  @ApiProperty({ example: '74.00' })
  settlementAmount!: string;

  @ApiProperty({ format: 'uuid' })
  createdByAdminUserId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  approvedByAdminUserId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  settledByAdminUserId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  cancelledByAdminUserId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  transferReference!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  approvedAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  settledAt!: Date | null;

  @ApiPropertyOptional({ type: Date, nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: Date })
  createdAt!: Date;

  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class DriverSettlementItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  commissionId!: string;

  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: CommissionCollectionMode })
  collectionMode!: CommissionCollectionMode;

  @ApiProperty({ example: '10.00' })
  baseAmount!: string;

  @ApiProperty({ example: '0.50' })
  commissionAmount!: string;

  @ApiProperty({ example: '9.50' })
  driverNetAmount!: string;

  @ApiProperty({ example: '9.50' })
  netEffectAmount!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ type: Date })
  accruedAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  releasedAt!: Date | null;
}

export class DriverSettlementDetailResponseDto extends DriverSettlementResponseDto {
  @ApiProperty({ type: [DriverSettlementItemResponseDto] })
  items!: DriverSettlementItemResponseDto[];
}

export class DriverSettlementListResponseDto {
  @ApiProperty({ type: [DriverSettlementResponseDto] })
  items!: DriverSettlementResponseDto[];

  @ApiProperty()
  pagination!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class DriverSettlementBalanceResponseDto {
  @ApiProperty({ example: '76.00' })
  availableDigitalNet!: string;

  @ApiProperty({ example: '2.00' })
  availableCashCommissionDebt!: string;

  @ApiProperty({ example: '74.00' })
  availableSettlementAmount!: string;

  @ApiProperty({ enum: SettlementDirection })
  availableDirection!: SettlementDirection;

  @ApiProperty({ example: '20.00' })
  allocatedNetAmount!: string;

  @ApiProperty({ enum: SettlementDirection })
  allocatedDirection!: SettlementDirection;

  @ApiProperty({ example: '0.50' })
  heldCommissionAmount!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ type: Date })
  asOf!: Date;
}
