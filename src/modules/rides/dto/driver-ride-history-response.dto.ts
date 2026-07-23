import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RideStatus } from '../enums/ride-status.enum';
import { RideHistoryPaginationDto } from './passenger-ride-history-response.dto';

export class DriverRideHistoryPassengerDto {
  @ApiProperty()
  firstName!: string;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ example: '4.90' })
  ratingAverage!: string;

  @ApiProperty()
  ratingCount!: number;
}

export class DriverRideHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  rideId!: string;

  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  originAddress!: string;

  @ApiProperty()
  destinationAddress!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  startedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt!: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  actualDistanceMeters!: number | null;

  @ApiPropertyOptional({ nullable: true })
  actualDurationSeconds!: number | null;

  @ApiProperty()
  estimatedFare!: string;

  @ApiPropertyOptional({ nullable: true })
  finalFare!: string | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiPropertyOptional({ type: DriverRideHistoryPassengerDto, nullable: true })
  passenger!: DriverRideHistoryPassengerDto | null;

  @ApiProperty()
  ratingSubmitted!: boolean;

  @ApiProperty()
  canRate!: boolean;
}

export class DriverRideHistoryResponseDto {
  @ApiProperty({ type: [DriverRideHistoryItemDto] })
  items!: DriverRideHistoryItemDto[];

  @ApiProperty({ type: RideHistoryPaginationDto })
  pagination!: RideHistoryPaginationDto;
}
