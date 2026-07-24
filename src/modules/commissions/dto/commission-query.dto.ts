import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { CommissionCollectionMode } from '../enums/commission-collection-mode.enum';
import { RideCommissionStatus } from '../enums/ride-commission-status.enum';

export class CommissionQueryDto {
  @ApiPropertyOptional({ enum: RideCommissionStatus })
  @IsOptional()
  @IsEnum(RideCommissionStatus)
  status?: RideCommissionStatus;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: CommissionCollectionMode })
  @IsOptional()
  @IsEnum(CommissionCollectionMode)
  collectionMode?: CommissionCollectionMode;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class AdminCommissionQueryDto extends CommissionQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverProfileId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  rideId?: string;
}
