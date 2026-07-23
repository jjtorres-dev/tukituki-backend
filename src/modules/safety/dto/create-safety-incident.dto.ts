import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { SafetyIncidentType } from '../enums/safety-incident-type.enum';

export class CreateSafetyIncidentDto {
  @ApiProperty({ enum: SafetyIncidentType })
  @IsEnum(SafetyIncidentType)
  incidentType!: SafetyIncidentType;

  @ApiPropertyOptional({ example: 'Necesito ayuda inmediata' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: -6.4877 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: -76.3599 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ example: 8, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy?: number;
}
