import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { ServiceZoneStatus } from '../enums/service-zone-status.enum';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class ServiceZoneQueryDto {
  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: ServiceZoneStatus,
  })
  @IsOptional()
  @IsEnum(ServiceZoneStatus)
  status?: ServiceZoneStatus;

  @ApiPropertyOptional({
    description: 'Busca por nombre o código',
    maxLength: 120,
  })
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
