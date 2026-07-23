import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { DriverOperationalStatus } from '../../driver-operations/enums/driver-operational-status.enum';
import { RideStatus } from '../enums/ride-status.enum';

export class DriverNoShowResponseDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  rematching!: boolean;

  @ApiProperty({ enum: DriverOperationalStatus })
  driverOperationalStatus!: DriverOperationalStatus;

  @ApiPropertyOptional({ nullable: true })
  progressMeters!: number | null;

  @ApiProperty()
  stateVersion!: number;
}
