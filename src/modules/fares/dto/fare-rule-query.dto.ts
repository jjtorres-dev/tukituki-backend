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

import { FareRuleStatus } from '../enums/fare-rule-status.enum';

export class FareRuleQueryDto {
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
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID('4')
  serviceZoneId?: string;

  @ApiPropertyOptional({
    enum: FareRuleStatus,
  })
  @IsOptional()
  @IsEnum(FareRuleStatus)
  status?: FareRuleStatus;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Filtra reglas aplicables en esta fecha y hora',
  })
  @IsOptional()
  @IsDateString()
  activeAt?: string;
}
