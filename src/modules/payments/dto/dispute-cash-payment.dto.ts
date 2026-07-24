import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { CashPaymentDisputeReason } from '../enums/cash-payment-dispute-reason.enum';

export class DisputeCashPaymentDto {
  @ApiProperty({ enum: CashPaymentDisputeReason })
  @IsEnum(CashPaymentDisputeReason)
  reason!: CashPaymentDisputeReason;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  detail?: string;
}
