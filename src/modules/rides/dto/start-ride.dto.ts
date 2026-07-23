import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class StartRideDto {
  @ApiProperty({
    example: '4827',
    pattern: '^\\d{4}$',
    description: 'Código de cuatro dígitos mostrado al pasajero',
  })
  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'El código debe contener exactamente cuatro dígitos',
  })
  code!: string;
}
