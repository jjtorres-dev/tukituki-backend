import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { CancellationFeeStatus } from '../enums/cancellation-fee-status.enum';
import { RideCancellationType } from '../enums/ride-cancellation-type.enum';

export class AdminRideCancellationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: RideCancellationType })
  @IsOptional()
  @IsEnum(RideCancellationType)
  cancellationType?: RideCancellationType;

  @ApiPropertyOptional({ enum: CancellationFeeStatus })
  @IsOptional()
  @IsEnum(CancellationFeeStatus)
  feeStatus?: CancellationFeeStatus;
}
