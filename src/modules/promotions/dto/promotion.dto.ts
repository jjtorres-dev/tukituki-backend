import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PromotionDiscountType } from '../enums/promotion-discount-type.enum';
import { PromotionStatus } from '../enums/promotion-status.enum';

export class CreatePromotionDto {
  @ApiProperty({ example: 'BIENVENIDO20' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/)
  code!: string;

  @ApiProperty({ maxLength: 120 })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ enum: PromotionDiscountType })
  @IsEnum(PromotionDiscountType)
  discountType!: PromotionDiscountType;

  @ApiPropertyOptional({ description: 'Porcentaje en puntos base: 2000 = 20%' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  discountBps?: number;

  @ApiPropertyOptional({ example: '5.00' })
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  fixedAmount?: string;

  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  maximumDiscountAmount?: string;

  @ApiPropertyOptional({ example: '8.00', default: '0.00' })
  @IsOptional()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/)
  minimumFareAmount?: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  endsAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  totalUsageLimit?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  perPassengerLimit?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  firstRideOnly?: boolean;

  @ApiPropertyOptional({
    enum: PromotionStatus,
    default: PromotionStatus.PAUSED,
  })
  @IsOptional()
  @IsEnum(PromotionStatus)
  status?: PromotionStatus;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {}

export class PromotionQueryDto {
  @ApiPropertyOptional({ enum: PromotionStatus })
  @IsOptional()
  @IsEnum(PromotionStatus)
  status?: PromotionStatus;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ValidatePromotionDto {
  @ApiProperty()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/)
  code!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fareQuoteId!: string;
}
