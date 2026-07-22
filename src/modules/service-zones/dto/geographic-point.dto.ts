import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GeographicPointDto {
  @ApiProperty({
    example: -6.4877,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
    maxDecimalPlaces: 8,
  })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @ApiProperty({
    example: -76.3599,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber({
    allowInfinity: false,
    allowNaN: false,
    maxDecimalPlaces: 8,
  })
  @Min(-180)
  @Max(180)
  longitude!: number;
}
