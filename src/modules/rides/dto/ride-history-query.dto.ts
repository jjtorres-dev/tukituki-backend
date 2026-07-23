import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';

export const RIDE_HISTORY_STATUSES = [
  RideStatus.COMPLETED,
  RideStatus.CANCELLED,
  RideStatus.EXPIRED,
] as const;

export type RideHistoryStatus = (typeof RIDE_HISTORY_STATUSES)[number];

export class RideHistoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: RIDE_HISTORY_STATUSES,
    description: 'Solo estados finales del viaje',
  })
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideHistoryStatus;

  @ApiPropertyOptional({
    example: '2026-07-01',
    description: 'Fecha UTC inicial inclusiva, formato YYYY-MM-DD',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
    description: 'Fecha UTC final inclusiva, formato YYYY-MM-DD',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
}
