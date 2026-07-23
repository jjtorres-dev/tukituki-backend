import { ApiProperty } from '@nestjs/swagger';

export class PublicSharedRideResponseDto {
  @ApiProperty({ format: 'uuid' })
  shareLinkId!: string;

  @ApiProperty()
  rideStatus!: string;

  @ApiProperty()
  origin!: { address: string; latitude: number; longitude: number };

  @ApiProperty()
  destination!: { address: string; latitude: number; longitude: number };

  @ApiProperty({ type: Object, nullable: true })
  driver!: {
    firstName: string;
    photoUrl: string | null;
    vehicle: {
      plate: string;
      brand: string;
      model: string;
      color: string;
    } | null;
  } | null;

  @ApiProperty({ type: Object, nullable: true })
  driverLocation!: {
    latitude: number;
    longitude: number;
    heading: number | null;
    recordedAt: Date;
  } | null;

  @ApiProperty()
  requestedAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  startedAt!: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;

  @ApiProperty()
  expiresAt!: Date;

  @ApiProperty()
  lastUpdatedAt!: Date;
}
