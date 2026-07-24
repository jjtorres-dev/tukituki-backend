import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDigitalCheckoutSessionDto {
  @ApiProperty({
    example: 'pasajero@example.com',
    description:
      'Correo enviado directamente a Izipay para el comprobante y antifraude.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
