import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ServiceZoneBoundaryDto } from './service-zone-boundary.dto';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class CreateServiceZoneDto {
  @ApiProperty({
    example: 'Tarapoto Centro',
    minLength: 3,
    maxLength: 120,
  })
  @Transform(trimString)
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    example: 'TARAPOTO_CENTRO',
    minLength: 3,
    maxLength: 50,
    pattern: '^[A-Z0-9_]+$',
  })
  @Transform(normalizeCode)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  code!: string;

  @ApiPropertyOptional({
    example: 'Zona principal de atención del servicio en Tarapoto',
    maxLength: 500,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    type: ServiceZoneBoundaryDto,
  })
  @ValidateNested()
  @Type(() => ServiceZoneBoundaryDto)
  boundary!: ServiceZoneBoundaryDto;

  @ApiPropertyOptional({
    example: 100,
    minimum: -1000,
    maximum: 1000,
    default: 0,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;
}
