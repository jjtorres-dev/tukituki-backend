import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
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
    example: 'TukiTuki2026',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password!: string;
}
