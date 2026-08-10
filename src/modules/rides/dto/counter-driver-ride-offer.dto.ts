import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CounterDriverRideOfferDto {
  @ApiProperty({
    example: '5.75',
    description:
      'Nuevo precio propuesto por el pasajero a este conductor. ' +
      'Debe ser menor que la propuesta vigente del conductor.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Matches(/^(?=.*[1-9])(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/, {
    message:
      'proposedFare debe ser un monto positivo ' + 'con máximo 2 decimales',
  })
  proposedFare!: string;
}
