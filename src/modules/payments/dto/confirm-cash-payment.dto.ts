import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmCashPaymentDto {
  @ApiProperty({
    example: '10.00',
    description:
      'Efectivo entregado por el pasajero. Debe cubrir la tarifa final.',
  })
  @IsString()
  @Matches(/^(0|[1-9]\d*)\.\d{2}$/)
  @MaxLength(11)
  cashReceived!: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  notes?: string;
}
