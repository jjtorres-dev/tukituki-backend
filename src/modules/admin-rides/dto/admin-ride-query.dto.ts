import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { RideStatus } from '../../rides/enums/ride-status.enum';

function parseBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class AdminRideQueryDto {
  @ApiPropertyOptional({ enum: RideStatus })
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;

  @ApiPropertyOptional({
    description:
      'Busca por ID del viaje, teléfono, nombre del pasajero o conductor y placa',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  passengerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverProfileId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Zona de origen o destino',
  })
  @IsOptional()
  @IsUUID()
  serviceZoneId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  requestedFrom?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  requestedTo?: string;

  @ApiPropertyOptional({
    description: 'Filtra viajes con al menos un incidente de seguridad',
  })
  @IsOptional()
  @Transform(({ value }) => parseBoolean(value))
  @IsBoolean()
  hasSafetyIncident?: boolean;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
