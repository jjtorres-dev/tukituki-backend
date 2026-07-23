import { ApiProperty } from '@nestjs/swagger';

export class RideWaitingResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  waitingStartedAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  noShowAvailableAt!: Date;

  @ApiProperty()
  requiredWaitingSeconds!: number;

  @ApiProperty()
  elapsedWaitingSeconds!: number;

  @ApiProperty()
  remainingWaitingSeconds!: number;

  @ApiProperty()
  canReportNoShow!: boolean;

  @ApiProperty({ example: '8.25' })
  startDistanceMeters!: string;
}
