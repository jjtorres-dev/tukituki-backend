import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { DriverStatus } from '../../drivers/enums/driver-status.enum';

export class AdminDriverQueryDto {
  @ApiPropertyOptional({
    enum: DriverStatus,
    default: DriverStatus.PENDING_REVIEW,
  })
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @ApiPropertyOptional({
    example: '12345678',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;

  @ApiPropertyOptional({
    example: '1234-AB',
    maxLength: 15,
  })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  plate?: string;

  @ApiPropertyOptional({
    example: '+51987654321',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+519\d{8}$/, {
    message: 'El teléfono debe tener el formato +519XXXXXXXX',
  })
  phoneE164?: string;

  @ApiPropertyOptional({
    example: '2026-07-01',
  })
  @IsOptional()
  @IsDateString({
    strict: true,
  })
  submittedFrom?: string;

  @ApiPropertyOptional({
    example: '2026-07-31',
  })
  @IsOptional()
  @IsDateString({
    strict: true,
  })
  submittedTo?: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
