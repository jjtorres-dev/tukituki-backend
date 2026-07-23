import { ApiProperty } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';

export class RideStartResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus, example: RideStatus.IN_PROGRESS })
  status!: RideStatus;

  @ApiProperty({ minimum: 1 })
  stateVersion!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  startedAt!: Date;
}
