import { ApiProperty } from '@nestjs/swagger';

import { RideStartCodeStatus } from '../enums/ride-start-code-status.enum';

export class PassengerRideStartCodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ example: '4827', pattern: '^\\d{4}$' })
  code!: string;

  @ApiProperty({ enum: RideStartCodeStatus })
  status!: RideStartCodeStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;

  @ApiProperty({ minimum: 0 })
  remainingSeconds!: number;

  @ApiProperty({ minimum: 0 })
  failedAttempts!: number;

  @ApiProperty({ minimum: 0 })
  remainingAttempts!: number;

  @ApiProperty({ minimum: 0 })
  regenerationCount!: number;

  @ApiProperty({ minimum: 0 })
  remainingRegenerations!: number;
}
