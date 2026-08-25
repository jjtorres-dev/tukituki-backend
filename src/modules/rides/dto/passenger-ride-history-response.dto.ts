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

  /*
   * SUGGESTED-DESTINATIONS-R1: coordenadas reales del destino, no solo
   * el texto de `destinationAddress`. Sin esto, un cliente que quisiera
   * ofrecer "viajes recientes" como sugerencia tendría que re-resolver
   * la dirección por texto (autocomplete + details, dos llamadas a
   * Google, sin garantía de llegar al mismo lugar) para poder fijarla
   * como destino. `Ride.destinationPosition` es `NOT NULL` desde la
   * migración que crea la tabla (`1784766330109-CreateFareQuotesAndRides`)
   * — nunca hay un ride sin ella — pero el campo se expone como
   * opcional/nullable de todos modos, a pedido explícito, como defensa
   * ante cualquier fila futura o dato corrupto que no la tenga.
   */
  @ApiPropertyOptional({ nullable: true, example: -6.4877 })
  destinationLatitude!: number | null;

  @ApiPropertyOptional({ nullable: true, example: -76.3599 })
  destinationLongitude!: number | null;

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
