import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../../payments/enums/payment-method.enum';

export class CreatePassengerRideDto {
  @ApiProperty({
    format: 'uuid',
  })
  @IsUUID()
  fareQuoteId!: string;

  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.CASH })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod = PaymentMethod.CASH;

  @ApiPropertyOptional({
    example: 'Estoy frente a la puerta principal',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  passengerNotes?: string;
}
