import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  MONEY_TWO_DECIMALS_PATTERN,
  MULTIPLIER_THREE_DECIMALS_PATTERN,
  RATE_FOUR_DECIMALS_PATTERN,
  trimString,
} from './fare-decimal.decorators';

export class CreateFareRuleDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID('4')
  serviceZoneId!: string;

  @ApiProperty({
    example: 'Tarifa estándar Tarapoto',
    minLength: 3,
    maxLength: 120,
  })
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: '2.50',
    description:
      'Importe monetario enviado como string con hasta dos decimales',
  })
  @Transform(trimString)
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  baseFare!: string;

  @ApiProperty({
    example: '5.00',
  })
  @Transform(trimString)
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  minimumFare!: string;

  @ApiProperty({
    example: '1.0000',
    description: 'Precio por kilómetro con hasta cuatro decimales',
  })
  @Transform(trimString)
  @IsString()
  @Matches(RATE_FOUR_DECIMALS_PATTERN)
  pricePerKm!: string;

  @ApiProperty({
    example: '0.1000',
    description: 'Precio por minuto con hasta cuatro decimales',
  })
  @Transform(trimString)
  @IsString()
  @Matches(RATE_FOUR_DECIMALS_PATTERN)
  pricePerMinute!: string;

  @ApiProperty({
    example: '0.50',
  })
  @Transform(trimString)
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  bookingFee!: string;

  @ApiProperty({
    example: '0.1000',
  })
  @Transform(trimString)
  @IsString()
  @Matches(RATE_FOUR_DECIMALS_PATTERN)
  waitingPricePerMinute!: string;

  @ApiProperty({
    example: '2.00',
  })
  @Transform(trimString)
  @IsString()
  @Matches(MONEY_TWO_DECIMALS_PATTERN)
  cancellationFee!: string;

  @ApiProperty({
    example: '1.150',
    description: 'Multiplicador nocturno. Debe estar entre 1.000 y 5.000',
  })
  @Transform(trimString)
  @IsString()
  @Matches(MULTIPLIER_THREE_DECIMALS_PATTERN)
  nightMultiplier!: string;

  @ApiProperty({
    example: '1.100',
    description: 'Multiplicador por lluvia. Debe estar entre 1.000 y 5.000',
  })
  @Transform(trimString)
  @IsString()
  @Matches(MULTIPLIER_THREE_DECIMALS_PATTERN)
  rainMultiplier!: string;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-07-22T00:00:00.000Z',
  })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2027-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;
}
