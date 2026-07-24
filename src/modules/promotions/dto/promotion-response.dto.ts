import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PromotionDiscountType } from '../enums/promotion-discount-type.enum';
import { PromotionStatus } from '../enums/promotion-status.enum';

export class PromotionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiPropertyOptional({ nullable: true })
  description!: string | null;
  @ApiProperty({ enum: PromotionDiscountType })
  discountType!: PromotionDiscountType;
  @ApiPropertyOptional({ nullable: true })
  discountBps!: number | null;
  @ApiPropertyOptional({ nullable: true })
  fixedAmount!: string | null;
  @ApiPropertyOptional({ nullable: true })
  maximumDiscountAmount!: string | null;
  @ApiProperty()
  minimumFareAmount!: string;
  @ApiProperty()
  currency!: string;
  @ApiProperty({ type: Date })
  startsAt!: Date;
  @ApiProperty({ type: Date })
  endsAt!: Date;
  @ApiPropertyOptional({ nullable: true })
  totalUsageLimit!: number | null;
  @ApiProperty()
  perPassengerLimit!: number;
  @ApiProperty()
  firstRideOnly!: boolean;
  @ApiProperty({ enum: PromotionStatus })
  status!: PromotionStatus;
  @ApiProperty()
  reservedUses!: number;
  @ApiProperty()
  appliedUses!: number;
  @ApiProperty()
  releasedUses!: number;
  @ApiProperty({ type: Date })
  createdAt!: Date;
  @ApiProperty({ type: Date })
  updatedAt!: Date;
}

export class PromotionListResponseDto {
  @ApiProperty({ type: [PromotionResponseDto] })
  items!: PromotionResponseDto[];
  @ApiProperty()
  pagination!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export class PromotionValidationResponseDto {
  @ApiProperty()
  code!: string;
  @ApiProperty()
  estimatedFare!: string;
  @ApiProperty()
  discountAmount!: string;
  @ApiProperty()
  passengerAmountDue!: string;
  @ApiProperty()
  currency!: string;
  @ApiProperty({ type: Date })
  expiresAt!: Date;
}
