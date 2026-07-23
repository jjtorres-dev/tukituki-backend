import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PassengerCancellationReason } from '../enums/passenger-cancellation-reason.enum';

export class PassengerCancelRideDto {
  @ApiProperty({ enum: PassengerCancellationReason })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(PassengerCancellationReason)
  reason!: PassengerCancellationReason;

  @ApiPropertyOptional({ minLength: 5, maxLength: 500 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reasonDetail?: string;

  @ApiPropertyOptional({ example: '2.00' })
  @IsOptional()
  @IsString()
  @Matches(/^(0|[1-9]\d*)\.\d{2}$/)
  expectedFee?: string;
}
