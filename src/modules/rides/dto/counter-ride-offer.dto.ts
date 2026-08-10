import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CounterRideOfferDto {
  @ApiProperty({
    example: '6.00',
    description:
      'Nuevo precio propuesto por el conductor. ' +
      'Puede ser menor, igual o mayor que el precio ofrecido por el pasajero.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^(?=.*[1-9])\d{1,4}(?:\.\d{1,2})?$/, {
    message:
      'proposedFare debe ser un monto positivo ' + 'con máximo 2 decimales',
  })
  proposedFare!: string;
}
