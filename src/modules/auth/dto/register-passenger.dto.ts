import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterPassengerDto {
  @ApiProperty({
    example: '+51987654321',
    description: 'Número móvil peruano en formato internacional E.164',
  })
  @IsString()
  @Matches(/^\+519\d{8}$/, {
    message: 'El teléfono debe tener el formato +519XXXXXXXX',
  })
  phoneE164!: string;

  @ApiProperty({
    example: 'TukiTuki2026!',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @MinLength(8, {
    message: 'La contraseña debe tener al menos 8 caracteres',
  })
  @MaxLength(64, {
    message: 'La contraseña no puede superar los 64 caracteres',
  })
  @Matches(/[a-z]/, {
    message: 'La contraseña debe incluir una letra minúscula',
  })
  @Matches(/[A-Z]/, {
    message: 'La contraseña debe incluir una letra mayúscula',
  })
  @Matches(/\d/, {
    message: 'La contraseña debe incluir un número',
  })
  @Matches(/[^A-Za-z0-9\s]/, {
    message: 'La contraseña debe incluir un carácter especial',
  })
  password!: string;
}
