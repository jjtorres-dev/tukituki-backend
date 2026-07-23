import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';

export class RideTransitionResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  stateVersion!: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  driverArrivingAt!: Date | null;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  driverArrivedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  arrivalDistanceMeters!: string | null;
}
