import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverCancellationReason } from '../enums/driver-cancellation-reason.enum';

export class DriverCancelRideDto {
  @ApiProperty({ enum: DriverCancellationReason })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(DriverCancellationReason)
  reason!: DriverCancellationReason;

  @ApiPropertyOptional({ minLength: 5, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reasonDetail?: string;
}
