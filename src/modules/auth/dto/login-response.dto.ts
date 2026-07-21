import { ApiProperty } from '@nestjs/swagger';

import { PublicUserDto } from './register-response.dto';

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT de corta duración para autorizar solicitudes',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Token utilizado para renovar la sesión',
  })
  refreshToken!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Identificador de la sesión creada',
  })
  sessionId!: string;

  @ApiProperty({
    example: 'Bearer',
  })
  tokenType!: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Duración del access token en segundos',
  })
  expiresIn!: number;

  @ApiProperty({
    example: 2592000,
    description: 'Duración del refresh token en segundos',
  })
  refreshExpiresIn!: number;

  @ApiProperty({
    type: PublicUserDto,
  })
  user!: PublicUserDto;
}
