import { Injectable } from '@nestjs/common';
import { DataSource, In, MoreThan } from 'typeorm';

import { DriverLocation } from '../../driver-operations/entities/driver-location.entity';
import { Ride } from '../../rides/entities/ride.entity';
import { RideStatus } from '../../rides/enums/ride-status.enum';
import { RideShareLink } from '../entities/ride-share-link.entity';
import { RideShareLinkStatus } from '../enums/ride-share-link-status.enum';
import { SharedRidesGateway } from './shared-rides.gateway';

const TERMINAL_STATUSES: readonly RideStatus[] = [
  RideStatus.COMPLETED,
  RideStatus.CANCELLED,
  RideStatus.EXPIRED,
];

@Injectable()
export class SharedRideRealtimeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: SharedRidesGateway,
  ) {}

  async emitDriverLocation(
    ride: Ride,
    location: DriverLocation,
  ): Promise<void> {
    const links = await this.dataSource.getRepository(RideShareLink).find({
      where: {
        rideId: ride.id,
        status: RideShareLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
    });
    for (const link of links) {
      this.gateway.emitToLink(link.id, 'ride.share-location.updated', {
        shareLinkId: link.id,
        rideStatus: ride.status,
        driverLocation: {
          latitude: this.round(location.latitude, 4),
          longitude: this.round(location.longitude, 4),
          heading: location.heading,
          recordedAt: location.recordedAt,
        },
      });
    }
  }

  async emitRideStatus(ride: Ride): Promise<void> {
    const repository = this.dataSource.getRepository(RideShareLink);
    const links = await repository.find({
      where: {
        rideId: ride.id,
        status: RideShareLinkStatus.ACTIVE,
        expiresAt: MoreThan(new Date()),
      },
    });
    for (const link of links) {
      this.gateway.emitToLink(link.id, 'ride.share-status.updated', {
        shareLinkId: link.id,
        rideStatus: ride.status,
        updatedAt: ride.updatedAt ?? new Date(),
      });
    }
    if (TERMINAL_STATUSES.includes(ride.status) && links.length > 0) {
      await repository.update(
        { id: In(links.map((link) => link.id)) },
        { status: RideShareLinkStatus.EXPIRED },
      );
    }
  }

  private round(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
  }
}
