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
import { ApiPropertyOptional } from '@nestjs/swagger';

import { ServiceZoneBoundaryDto } from './service-zone-boundary.dto';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeCode({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class UpdateServiceZoneDto {
  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 120,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 50,
    pattern: '^[A-Z0-9_]+$',
  })
  @Transform(normalizeCode)
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/)
  code?: string;

  @ApiPropertyOptional({
    maxLength: 500,
    nullable: true,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    type: ServiceZoneBoundaryDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ServiceZoneBoundaryDto)
  boundary?: ServiceZoneBoundaryDto;

  @ApiPropertyOptional({
    minimum: -1000,
    maximum: 1000,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(-1000)
  @Max(1000)
  priority?: number;
}
