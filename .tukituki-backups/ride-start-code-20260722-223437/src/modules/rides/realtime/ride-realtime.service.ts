import { Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { DriverLocation } from '../../driver-operations/entities/driver-location.entity';
import { Ride } from '../entities/ride.entity';
import { RideStatus } from '../enums/ride-status.enum';
import { RidesGateway } from './rides.gateway';

const LOCATION_VISIBLE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

@Injectable()
export class RideRealtimeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: RidesGateway,
  ) {}

  emitAssigned(ride: Ride): void {
    this.gateway.emitToRide(ride.id, 'ride.assigned', {
      rideId: ride.id,
      driverProfileId: ride.driverProfileId,
      status: ride.status,
      stateVersion: ride.stateVersion,
      driverAssignedAt: ride.driverAssignedAt,
    });
  }

  emitStatusChanged(ride: Ride, previousStatus: RideStatus): void {
    this.gateway.emitToRide(ride.id, 'ride.status.changed', {
      rideId: ride.id,
      previousStatus,
      status: ride.status,
      stateVersion: ride.stateVersion,
      occurredAt: ride.updatedAt ?? new Date(),
    });
  }

  emitCancelled(ride: Ride): void {
    this.gateway.emitToRide(ride.id, 'ride.cancelled', {
      rideId: ride.id,
      status: ride.status,
      stateVersion: ride.stateVersion,
      cancelledAt: ride.cancelledAt,
      cancelledBy: ride.cancelledBy,
      cancellationReason: ride.cancellationReason,
    });
  }

  async emitDriverLocation(
    driverProfileId: string,
    location: DriverLocation,
  ): Promise<void> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        driverProfileId,
        status: In([...LOCATION_VISIBLE_STATUSES]),
      },
      order: { requestedAt: 'DESC' },
    });

    if (!ride) {
      return;
    }

    this.gateway.emitToRide(ride.id, 'ride.driver-location.updated', {
      rideId: ride.id,
      latitude: location.latitude,
      longitude: location.longitude,
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      recordedAt: location.recordedAt,
    });
  }
}
