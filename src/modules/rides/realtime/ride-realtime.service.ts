import { Injectable, Logger, Optional } from '@nestjs/common';
import { DataSource, In } from 'typeorm';

import { DriverLocation } from '../../driver-operations/entities/driver-location.entity';
import type { RideProgressUpdate } from '../../driver-operations/ride-progress-tracking.service';
import { RideSafetyIncident } from '../../safety/entities/ride-safety-incident.entity';
import { SharedRideRealtimeService } from '../../safety/realtime/shared-ride-realtime.service';
import { RideFinalFare } from '../entities/ride-final-fare.entity';
import { RideWaiting } from '../entities/ride-waiting.entity';
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
  private readonly logger = new Logger(RideRealtimeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: RidesGateway,
    @Optional()
    private readonly sharedRideRealtimeService?: SharedRideRealtimeService,
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
    this.emitSharedRideStatus(ride);
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
    this.emitSharedRideStatus(ride);
  }

  emitWaitingStarted(waiting: RideWaiting): void {
    this.gateway.emitToRide(waiting.rideId, 'ride.waiting.started', {
      rideId: waiting.rideId,
      waitingStartedAt: waiting.waitingStartedAt,
      noShowAvailableAt: waiting.noShowAvailableAt,
      requiredWaitingSeconds: waiting.requiredWaitingSeconds,
    });
  }

  emitRematching(ride: Ride, previousDriverProfileId: string): void {
    this.gateway.emitToRide(ride.id, 'ride.rematching', {
      rideId: ride.id,
      status: ride.status,
      stateVersion: ride.stateVersion,
      previousDriverProfileId,
      searchExpiresAt: ride.searchExpiresAt,
    });
  }

  emitSafetyIncidentCreated(incident: RideSafetyIncident): void {
    this.gateway.emitToRide(incident.rideId, 'ride.sos.created', {
      incidentId: incident.id,
      rideId: incident.rideId,
      reporterRole: incident.reporterRole,
      incidentType: incident.incidentType,
      severity: incident.severity,
      status: incident.status,
      createdAt: incident.createdAt,
    });
  }

  emitSafetyStatusChanged(incident: RideSafetyIncident): void {
    this.gateway.emitToRide(incident.rideId, 'ride.safety-status.changed', {
      incidentId: incident.id,
      rideId: incident.rideId,
      status: incident.status,
      acknowledgedAt: incident.acknowledgedAt,
      resolvedAt: incident.resolvedAt,
      updatedAt: incident.updatedAt,
    });
  }

  emitStarted(ride: Ride): void {
    this.gateway.emitToRide(ride.id, 'ride.started', {
      rideId: ride.id,
      status: ride.status,
      stateVersion: ride.stateVersion,
      startedAt: ride.startedAt,
    });
  }

  emitProgress(progress: RideProgressUpdate): void {
    this.gateway.emitToRide(progress.rideId, 'ride.progress.updated', {
      rideId: progress.rideId,
      stateVersion: progress.stateVersion,
      trackedDistanceMeters: progress.trackedDistanceMeters,
      durationSeconds: progress.durationSeconds,
      acceptedForMetrics: progress.acceptedForMetrics,
      rejectionReason: progress.rejectionReason,
      driverLocation: {
        latitude: progress.latitude,
        longitude: progress.longitude,
        heading: progress.heading,
        speed: progress.speed,
        accuracy: progress.accuracy,
        recordedAt: progress.recordedAt,
      },
    });
  }

  emitCompleted(ride: Ride, fare: RideFinalFare): void {
    this.gateway.emitToRide(ride.id, 'ride.completed', {
      rideId: ride.id,
      status: ride.status,
      stateVersion: ride.stateVersion,
      completedAt: ride.completedAt,
      actualDistanceMeters: ride.actualDistanceMeters,
      actualDurationSeconds: ride.actualDurationSeconds,
      estimatedFare: ride.estimatedFare,
      agreedFare: ride.agreedFare,
      finalFare: fare.finalFare,
      currency: fare.currency,
      fareWasCapped: fare.fareWasCapped,
    });
    this.emitSharedRideStatus(ride);
  }

  private emitSharedRideStatus(ride: Ride): void {
    const pending = this.sharedRideRealtimeService?.emitRideStatus(ride);
    if (!pending) return;
    void pending.catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo publicar el estado compartido del viaje ${ride.id}: ${message}`,
      );
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
    await this.sharedRideRealtimeService?.emitDriverLocation(ride, location);
  }
}
