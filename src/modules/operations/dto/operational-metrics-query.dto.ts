import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { OperationalMetricInterval } from '../enums/operational-metric-interval.enum';

export class OperationalMetricsQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inicio inclusivo. Por defecto, hace 30 días.',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Fin exclusivo. Por defecto, la fecha actual.',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filtra por la zona de origen del viaje.',
  })
  @IsOptional()
  @IsUUID()
  serviceZoneId?: string;
}

export class OperationalTimeSeriesQueryDto extends OperationalMetricsQueryDto {
  @ApiPropertyOptional({
    enum: OperationalMetricInterval,
    default: OperationalMetricInterval.DAY,
  })
  @IsOptional()
  @IsEnum(OperationalMetricInterval)
  interval: OperationalMetricInterval = OperationalMetricInterval.DAY;
}

export class RideReportExportQueryDto extends OperationalMetricsQueryDto {
  @ApiPropertyOptional({ default: 10000, minimum: 1, maximum: 10000 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  limit: number = 10000;
}
