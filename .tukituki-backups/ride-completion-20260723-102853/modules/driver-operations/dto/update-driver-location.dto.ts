import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDriverLocationDto {
  @ApiProperty({
    example: -6.4877,
    minimum: -85.05112878,
    maximum: 85.05112878,
  })
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 8,
  })
  @Min(-85.05112878)
  @Max(85.05112878)
  latitude!: number;

  @ApiProperty({
    example: -76.3599,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber({
    maxDecimalPlaces: 8,
  })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiPropertyOptional({
    example: 90,
    minimum: 0,
    maximum: 360,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @ApiPropertyOptional({
    example: 7.5,
    minimum: 0,
    description: 'Velocidad reportada por el dispositivo en metros por segundo',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number;

  @ApiPropertyOptional({
    example: 8,
    minimum: 0.1,
    maximum: 1000,
    description: 'Precisión estimada del GPS en metros',
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  accuracy?: number;
}
