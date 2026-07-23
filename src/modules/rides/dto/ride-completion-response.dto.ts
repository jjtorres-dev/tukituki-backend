import { ApiProperty } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';

export class RideCompletionResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus, example: RideStatus.COMPLETED })
  status!: RideStatus;

  @ApiProperty({ example: 5 })
  stateVersion!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  completedAt!: Date;

  @ApiProperty({ example: 3512 })
  actualDistanceMeters!: number;

  @ApiProperty({ example: 780 })
  actualDurationSeconds!: number;

  @ApiProperty({ example: '7.40' })
  estimatedFare!: string;

  @ApiProperty({ example: '8.10' })
  finalFare!: string;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ example: false })
  fareWasCapped!: boolean;
}
