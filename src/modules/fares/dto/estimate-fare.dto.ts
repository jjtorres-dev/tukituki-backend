import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { FareEstimateLocationDto } from './fare-estimate-location.dto';

export class EstimateFareDto {
  @ApiProperty({
    type: FareEstimateLocationDto,
  })
  @ValidateNested()
  @Type(() => FareEstimateLocationDto)
  origin!: FareEstimateLocationDto;

  @ApiProperty({
    type: FareEstimateLocationDto,
  })
  @ValidateNested()
  @Type(() => FareEstimateLocationDto)
  destination!: FareEstimateLocationDto;

  /*
   * Campos heredados del cliente anterior.
   *
   * Se mantienen temporalmente para no romper
   * versiones de Passenger que todavía los envían.
   *
   * IMPORTANTE:
   * FaresService ya NO confía en estos valores.
   * La distancia y duración reales de la cotización
   * son obtenidas desde Google Routes.
   */
  @ApiPropertyOptional({
    example: 3200,
    minimum: 1,
    maximum: 100000,
    deprecated: true,
    description:
      'Obsoleto. El backend calcula la distancia usando Google Routes.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  distanceMeters?: number;

  @ApiPropertyOptional({
    example: 720,
    minimum: 1,
    maximum: 86400,
    deprecated: true,
    description:
      'Obsoleto. El backend calcula la duración usando Google Routes.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds?: number;

  @ApiPropertyOptional({
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isNight?: boolean;

  @ApiPropertyOptional({
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isRaining?: boolean;
}
