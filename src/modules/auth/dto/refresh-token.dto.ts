import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token entregado durante el inicio de sesión',
    example: 'f544d52a-39e0-4da3-8861-6010355c5dba.secreto-aleatorio',
  })
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[A-Za-z0-9_-]{64}$/i,
    {
      message: 'El refresh token proporcionado no tiene un formato válido',
    },
  )
  refreshToken!: string;
}
