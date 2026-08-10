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

  /*
   * Durante la transición hacia el nuevo
   * sistema de negociación este campo
   * permanece opcional.
   *
   * Si una versión antigua de Passenger
   * no lo envía, backend utilizará
   * estimatedFare como oferta inicial.
   */
  @ApiPropertyOptional({
    example: '5.50',
    description:
      'Precio que el pasajero desea ofrecer por el viaje. ' +
      'Si no se envía, se utiliza temporalmente ' +
      'la tarifa sugerida por TukiTuki.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^(?=.*[1-9])(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/, {
    message:
      'passengerOfferFare debe ser un monto positivo ' +
      'con máximo 2 decimales',
  })
  passengerOfferFare?: string;

  @ApiPropertyOptional({
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
  })
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
