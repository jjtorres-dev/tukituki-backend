import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverActiveRideResponseDto } from './dto/driver-active-ride-response.dto';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideViewService } from './ride-view.service';

const ACTIVE_DRIVER_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

@Injectable()
export class DriverRidesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rideViewService: RideViewService,
  ) {}

  async getActiveRide(userId: string): Promise<DriverActiveRideResponseDto> {
    const profile = await this.getApprovedProfile(userId);
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        driverProfileId: profile.id,
        status: In([...ACTIVE_DRIVER_RIDE_STATUSES]),
      },
      order: { driverAssignedAt: 'DESC' },
    });

    if (!ride) {
      throw new NotFoundException('El conductor no tiene un viaje activo');
    }

    return this.mapRide(profile.id, ride);
  }

  async getRide(
    userId: string,
    rideId: string,
  ): Promise<DriverActiveRideResponseDto> {
    const profile = await this.getApprovedProfile(userId);
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        id: rideId,
        driverProfileId: profile.id,
      },
    });

    if (!ride) {
      throw new NotFoundException(
        'El viaje no existe o no pertenece al conductor',
      );
    }

    return this.mapRide(profile.id, ride);
  }

  private async getApprovedProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.dataSource
      .getRepository(DriverProfile)
      .findOne({ where: { userId } });

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
  }

  private async mapRide(
    driverProfileId: string,
    ride: Ride,
  ): Promise<DriverActiveRideResponseDto> {
    const location = await this.dataSource
      .getRepository(DriverLocation)
      .findOne({ where: { driverProfileId } });

    let distanceToOriginMeters: number | null = null;

    if (location) {
      const rows = await this.dataSource.query<
        Array<{ distanceMeters: string | number | null }>
      >(
        `SELECT ST_Distance(location.position, ride.origin_position) AS "distanceMeters"
         FROM driver_locations location
         INNER JOIN rides ride ON ride.id = $1
         WHERE location.driver_profile_id = $2
         LIMIT 1`,
        [ride.id, driverProfileId],
      );

      const distance = Number(rows[0]?.distanceMeters);
      distanceToOriginMeters = Number.isFinite(distance)
        ? Math.round(distance)
        : null;
    }

    return this.rideViewService.toDriverResponse(ride, distanceToOriginMeters);
  }
}
