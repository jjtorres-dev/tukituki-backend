import { ApiPropertyOptional } from '@nestjs/swagger';
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

import { RideStatusActor } from '../../rides/enums/ride-status-actor.enum';
import { SafetyIncidentSeverity } from '../enums/safety-incident-severity.enum';
import { SafetyIncidentStatus } from '../enums/safety-incident-status.enum';
import { SafetyIncidentType } from '../enums/safety-incident-type.enum';

export class AdminSafetyIncidentQueryDto {
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

  @ApiPropertyOptional({ enum: SafetyIncidentStatus })
  @IsOptional()
  @IsEnum(SafetyIncidentStatus)
  status?: SafetyIncidentStatus;

  @ApiPropertyOptional({ enum: SafetyIncidentSeverity })
  @IsOptional()
  @IsEnum(SafetyIncidentSeverity)
  severity?: SafetyIncidentSeverity;

  @ApiPropertyOptional({ enum: SafetyIncidentType })
  @IsOptional()
  @IsEnum(SafetyIncidentType)
  incidentType?: SafetyIncidentType;

  @ApiPropertyOptional({ enum: RideStatusActor })
  @IsOptional()
  @IsEnum(RideStatusActor)
  reporterRole?: RideStatusActor;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  rideId?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
