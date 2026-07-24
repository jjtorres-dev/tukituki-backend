import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsEnum,
  IsString,
  IsUUID,
  Matches,
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
    example: 'BIENVENIDO20',
    description: 'Codigo promocional previamente validado',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{3,30}$/)
  couponCode?: string;

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
