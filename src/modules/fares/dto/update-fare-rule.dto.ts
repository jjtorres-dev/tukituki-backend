import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import {
  MONEY_TWO_DECIMALS_PATTERN,
  MULTIPLIER_THREE_DECIMALS_PATTERN,
  RATE_FOUR_DECIMALS_PATTERN,
  trimString,
} from './fare-decimal.decorators';

export class UpdateFareRuleDto {
  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 120,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  baseFare?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  minimumFare?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(RATE_FOUR_DECIMALS_PATTERN)
  pricePerKm?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(RATE_FOUR_DECIMALS_PATTERN)
  pricePerMinute?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  bookingFee?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(RATE_FOUR_DECIMALS_PATTERN)
  waitingPricePerMinute?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  cancellationFee?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MULTIPLIER_THREE_DECIMALS_PATTERN)
  nightMultiplier?: string;

  @ApiPropertyOptional()
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @Matches(MULTIPLIER_THREE_DECIMALS_PATTERN)
  rainMultiplier?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
  })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string | null;
}
