import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { VehicleType } from '../../drivers/enums/vehicle-type.enum';
import { RideStatus } from '../enums/ride-status.enum';

export class RideHistoryPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;

  @ApiProperty()
  hasNextPage!: boolean;

  @ApiProperty()
  hasPreviousPage!: boolean;
}

export class PassengerRideHistoryDriverDto {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty()
  firstName!: string;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty()
  vehiclePlate!: string;

  @ApiProperty()
  vehicleBrand!: string;

  @ApiProperty()
  vehicleModel!: string;

  @ApiProperty()
  vehicleColor!: string;

  @ApiProperty({ enum: VehicleType })
  vehicleType!: VehicleType;

  @ApiProperty({ example: '4.85' })
  ratingAverage!: string;

  @ApiProperty()
  ratingCount!: number;
}

export class PassengerRideHistoryItemDto {
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

  @ApiPropertyOptional({ type: PassengerRideHistoryDriverDto, nullable: true })
  driver!: PassengerRideHistoryDriverDto | null;

  @ApiProperty()
  ratingSubmitted!: boolean;

  @ApiProperty()
  canRate!: boolean;
}

export class PassengerRideHistoryResponseDto {
  @ApiProperty({ type: [PassengerRideHistoryItemDto] })
  items!: PassengerRideHistoryItemDto[];

  @ApiProperty({ type: RideHistoryPaginationDto })
  pagination!: RideHistoryPaginationDto;
}
