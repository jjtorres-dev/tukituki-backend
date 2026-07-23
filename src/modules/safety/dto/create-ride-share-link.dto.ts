import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateRideShareLinkDto {
  @ApiPropertyOptional({
    description: 'Duración del enlace en minutos',
    default: 120,
    minimum: 15,
    maximum: 1440,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(1440)
  expiresInMinutes?: number;
}
