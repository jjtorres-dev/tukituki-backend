import { Transform } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { PassengerCancellationReason } from '../enums/passenger-cancellation-reason.enum';

export class PassengerCancellationPreviewDto {
  @ApiProperty({ enum: PassengerCancellationReason })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(PassengerCancellationReason)
  reason!: PassengerCancellationReason;
}
