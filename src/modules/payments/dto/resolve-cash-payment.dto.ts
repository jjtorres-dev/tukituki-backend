import { Transform } from 'class-transformer';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { CashPaymentResolution } from '../enums/cash-payment-resolution.enum';

export class ResolveCashPaymentDto {
  @ApiProperty({ enum: CashPaymentResolution })
  @IsEnum(CashPaymentResolution)
  resolution!: CashPaymentResolution;

  @ApiProperty({ maxLength: 1000 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  notes!: string;
}
