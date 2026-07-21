import { ApiProperty } from '@nestjs/swagger';

import { PublicUserDto } from './register-response.dto';

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT para autorizar solicitudes',
  })
  accessToken!: string;

  @ApiProperty({
    example: 'Bearer',
  })
  tokenType!: 'Bearer';

  @ApiProperty({
    example: 900,
    description: 'Duración del token en segundos',
  })
  expiresIn!: number;

  @ApiProperty({
    type: PublicUserDto,
  })
  user!: PublicUserDto;
}
