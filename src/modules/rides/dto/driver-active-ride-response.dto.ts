import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PaymentMethod } from '../../payments/enums/payment-method.enum';
import { RideStatus } from '../enums/ride-status.enum';
import { RideLocationResponseDto } from './passenger-ride-response.dto';

/**
 * Resumen mínimo del Passenger para identificarlo durante el Ride.
 * Excluye deliberadamente apellido, teléfono, email, documento y
 * cualquier otro dato sensible del perfil.
 */
export class RideAssignedPassengerResponseDto {
  @ApiProperty({ format: 'uuid' })
  profileId!: string;

  @ApiProperty()
  firstName!: string;

  /*
   * "Pérez" -> "P.". Nunca el apellido completo.
   */
  @ApiProperty({ example: 'L.' })
  lastNameInitial!: string;

  @ApiPropertyOptional({ nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ example: '4.90' })
  ratingAverage!: string;

  @ApiProperty({ example: 32 })
  ratingCount!: number;
}

export class DriverActiveRideResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: RideStatus })
  status!: RideStatus;

  @ApiProperty()
  stateVersion!: number;

  @ApiProperty({ type: RideLocationResponseDto })
  origin!: RideLocationResponseDto;

  @ApiProperty({ type: RideLocationResponseDto })
  destination!: RideLocationResponseDto;

  @ApiProperty()
  distanceMeters!: number;

  @ApiProperty()
  estimatedDurationSeconds!: number;

  @ApiProperty()
  estimatedFare!: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '6.00',
  })
  agreedFare!: string | null;

  @ApiProperty({ example: 'PEN' })
  currency!: string;

  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ nullable: true })
  passengerNotes!: string | null;

  @ApiPropertyOptional({
    type: RideAssignedPassengerResponseDto,
    nullable: true,
  })
  passenger!: RideAssignedPassengerResponseDto | null;

  @ApiProperty({ type: String, format: 'date-time' })
  requestedAt!: Date;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
  })
  driverAssignedAt!: Date | null;

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

  @ApiPropertyOptional({ nullable: true })
  distanceToOriginMeters!: number | null;
}
