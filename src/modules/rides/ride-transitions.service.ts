import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { RideTransitionResponseDto } from './dto/ride-transition-response.dto';
import { RideOffer } from './entities/ride-offer.entity';
import { RideStatusHistory } from './entities/ride-status-history.entity';
import { Ride } from './entities/ride.entity';
import { RideCancellationActor } from './enums/ride-cancellation-actor.enum';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatusActor } from './enums/ride-status-actor.enum';
import { RideStatus } from './enums/ride-status.enum';
import {
  DRIVER_ARRIVAL_MAX_DISTANCE_METERS,
  DRIVER_LOCATION_MAX_ACCURACY_METERS,
  DRIVER_LOCATION_MAX_AGE_MS,
} from './ride-lifecycle.constants';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideStartCodesService } from './ride-start-codes.service';

const ALLOWED_TRANSITIONS: Readonly<Record<RideStatus, readonly RideStatus[]>> =
  {
    [RideStatus.SEARCHING_DRIVER]: [
      RideStatus.DRIVER_ASSIGNED,
      RideStatus.CANCELLED,
      RideStatus.EXPIRED,
    ],
    [RideStatus.DRIVER_ASSIGNED]: [
      RideStatus.DRIVER_ARRIVING,
      RideStatus.CANCELLED,
    ],
    [RideStatus.DRIVER_ARRIVING]: [
      RideStatus.DRIVER_ARRIVED,
      RideStatus.CANCELLED,
    ],
    [RideStatus.DRIVER_ARRIVED]: [RideStatus.IN_PROGRESS, RideStatus.CANCELLED],
    [RideStatus.IN_PROGRESS]: [RideStatus.COMPLETED, RideStatus.CANCELLED],
    [RideStatus.COMPLETED]: [],
    [RideStatus.CANCELLED]: [],
    [RideStatus.EXPIRED]: [],
  };

interface TransitionContext {
  actorType: RideStatusActor;
  actorUserId: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: Date;
}

interface CancellationOutcome {
  ride: Ride;
  previousStatus: RideStatus;
  releasedDriverProfileId: string | null;
}

@Injectable()
export class RideTransitionsService {
  private readonly logger = new Logger(RideTransitionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
    private readonly realtimeService: RideRealtimeService,
    private readonly rideStartCodesService: RideStartCodesService,
    @Optional() private readonly outboxService?: OutboxService,
  ) {}

  async startArrival(
    driverUserId: string,
    rideId: string,
  ): Promise<RideTransitionResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedDriver(manager, driverUserId);
      const ride = await this.lockRide(manager, rideId);

      this.assertAssignedDriver(ride, profile.id);
      this.assertTransitionAllowed(ride.status, RideStatus.DRIVER_ARRIVING);
      await this.assertDriverBusy(manager, profile.id);

      const previousStatus = ride.status;
      const now = new Date();
      ride.driverArrivingAt = now;

      await this.transitionWithinTransaction(
        manager,
        ride,
        RideStatus.DRIVER_ARRIVING,
        {
          actorType: RideStatusActor.DRIVER,
          actorUserId: driverUserId,
          occurredAt: now,
        },
      );

      return { ride, previousStatus };
    });

    this.emitStatusChangedSafely(outcome.ride, outcome.previousStatus);

    return this.mapTransition(outcome.ride);
  }

  async markArrived(
    driverUserId: string,
    rideId: string,
  ): Promise<RideTransitionResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedDriver(manager, driverUserId);
      const ride = await this.lockRide(manager, rideId);

      this.assertAssignedDriver(ride, profile.id);
      this.assertTransitionAllowed(ride.status, RideStatus.DRIVER_ARRIVED);
      await this.assertDriverBusy(manager, profile.id);

      const location = await manager.getRepository(DriverLocation).findOne({
        where: { driverProfileId: profile.id },
        lock: { mode: 'pessimistic_read' },
      });

      if (!location) {
        throw new BadRequestException(
          'Debes registrar una ubicación GPS antes de informar tu llegada',
        );
      }

      const now = new Date();

      if (
        now.getTime() - location.recordedAt.getTime() >
        DRIVER_LOCATION_MAX_AGE_MS
      ) {
        throw new BadRequestException(
          'La ubicación GPS está vencida; actualízala antes de registrar la llegada',
        );
      }

      if (
        location.accuracy === null ||
        location.accuracy > DRIVER_LOCATION_MAX_ACCURACY_METERS
      ) {
        throw new BadRequestException(
          'La precisión GPS no es suficiente para registrar la llegada',
        );
      }

      const distanceMeters = await this.distanceToOrigin(
        manager,
        ride.id,
        profile.id,
      );

      if (distanceMeters > DRIVER_ARRIVAL_MAX_DISTANCE_METERS) {
        throw new BadRequestException({
          message:
            'Debes estar cerca del punto de origen para registrar tu llegada',
          distanceToOriginMeters: Math.round(distanceMeters),
          maximumArrivalDistanceMeters: DRIVER_ARRIVAL_MAX_DISTANCE_METERS,
        });
      }

      const previousStatus = ride.status;
      ride.driverArrivedAt = now;
      ride.arrivalDistanceMeters = distanceMeters.toFixed(2);

      await this.transitionWithinTransaction(
        manager,
        ride,
        RideStatus.DRIVER_ARRIVED,
        {
          actorType: RideStatusActor.DRIVER,
          actorUserId: driverUserId,
          occurredAt: now,
          metadata: {
            arrivalDistanceMeters: ride.arrivalDistanceMeters,
            locationRecordedAt: location.recordedAt.toISOString(),
            locationAccuracyMeters: location.accuracy,
          },
        },
      );

      await this.rideStartCodesService.createForArrivedRideWithinTransaction(
        manager,
        ride,
        now,
      );

      return { ride, previousStatus };
    });

    this.emitStatusChangedSafely(outcome.ride, outcome.previousStatus);

    return this.mapTransition(outcome.ride);
  }

  async cancelByPassenger(
    passengerUserId: string,
    rideId: string,
    reason: string,
  ): Promise<Ride> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<CancellationOutcome> => {
        const passenger = await manager.getRepository(User).findOne({
          where: { id: passengerUserId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!passenger) {
          throw new NotFoundException('El pasajero no existe');
        }

        if (
          passenger.status !== UserStatus.ACTIVE ||
          !passenger.isPhoneVerified ||
          !passenger.roles.includes(UserRole.PASSENGER)
        ) {
          throw new ForbiddenException(
            'La cuenta del pasajero no está habilitada',
          );
        }

        const ride = await this.lockRide(manager, rideId);

        if (ride.passengerUserId !== passengerUserId) {
          throw new NotFoundException('El viaje no existe');
        }

        const allowedStatuses: readonly RideStatus[] = [
          RideStatus.SEARCHING_DRIVER,
          RideStatus.DRIVER_ASSIGNED,
          RideStatus.DRIVER_ARRIVING,
          RideStatus.DRIVER_ARRIVED,
        ];

        if (!allowedStatuses.includes(ride.status)) {
          throw new BadRequestException(
            'El viaje ya no puede cancelarse en su estado actual',
          );
        }

        const previousStatus = ride.status;
        const now = new Date();
        let releasedDriverProfileId: string | null = null;

        if (ride.driverProfileId) {
          const state = await manager
            .getRepository(DriverOperationalState)
            .findOne({
              where: { driverProfileId: ride.driverProfileId },
              lock: { mode: 'pessimistic_write' },
            });

          if (state?.status === DriverOperationalStatus.BUSY) {
            state.status = DriverOperationalStatus.AVAILABLE;
            state.lastSeenAt = now;
            state.disconnectedAt = null;
            await manager.getRepository(DriverOperationalState).save(state);
            releasedDriverProfileId = ride.driverProfileId;
          }
        }

        ride.cancelledAt = now;
        ride.cancelledBy = RideCancellationActor.PASSENGER;
        ride.cancellationReason = reason.trim();

        await this.transitionWithinTransaction(
          manager,
          ride,
          RideStatus.CANCELLED,
          {
            actorType: RideStatusActor.PASSENGER,
            actorUserId: passengerUserId,
            occurredAt: now,
            metadata: {
              releasedDriverProfileId,
            },
          },
        );

        await manager.getRepository(RideOffer).update(
          {
            rideId: ride.id,
            status: RideOfferStatus.OFFERED,
          },
          {
            status: RideOfferStatus.CANCELLED,
            respondedAt: now,
            cancelledAt: now,
          },
        );

        await this.rideStartCodesService.cancelForRideWithinTransaction(
          manager,
          ride.id,
          now,
        );

        return {
          ride,
          previousStatus,
          releasedDriverProfileId,
        };
      },
    );

    if (outcome.releasedDriverProfileId) {
      await this.restoreAvailability(outcome.releasedDriverProfileId);
    }

    this.emitStatusChangedSafely(outcome.ride, outcome.previousStatus);
    this.emitCancelledSafely(outcome.ride);

    return outcome.ride;
  }

  async expireSearchingRide(rideId: string): Promise<boolean> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const ride = await this.lockRide(manager, rideId);

      if (
        ride.status !== RideStatus.SEARCHING_DRIVER ||
        ride.searchExpiresAt.getTime() > Date.now()
      ) {
        return null;
      }

      const previousStatus = ride.status;
      const occurredAt = new Date();
      await this.expireWithinTransaction(manager, ride, occurredAt);

      await manager.getRepository(RideOffer).update(
        {
          rideId: ride.id,
          status: RideOfferStatus.OFFERED,
        },
        {
          status: RideOfferStatus.EXPIRED,
          respondedAt: occurredAt,
        },
      );

      return { ride, previousStatus };
    });

    if (!outcome) {
      return false;
    }

    this.emitStatusChangedSafely(outcome.ride, outcome.previousStatus);

    return true;
  }

  async assignDriverWithinTransaction(
    manager: EntityManager,
    ride: Ride,
    driverProfileId: string,
    driverUserId: string,
    offerId: string,
    occurredAt: Date,
  ): Promise<void> {
    ride.driverProfileId = driverProfileId;
    ride.driverAssignedAt = occurredAt;

    await this.transitionWithinTransaction(
      manager,
      ride,
      RideStatus.DRIVER_ASSIGNED,
      {
        actorType: RideStatusActor.DRIVER,
        actorUserId: driverUserId,
        occurredAt,
        metadata: { offerId, driverProfileId },
      },
    );
  }

  async expireWithinTransaction(
    manager: EntityManager,
    ride: Ride,
    occurredAt: Date,
  ): Promise<void> {
    await this.transitionWithinTransaction(manager, ride, RideStatus.EXPIRED, {
      actorType: RideStatusActor.SYSTEM,
      actorUserId: null,
      occurredAt,
    });
  }

  async transitionWithinTransaction(
    manager: EntityManager,
    ride: Ride,
    newStatus: RideStatus,
    context: TransitionContext,
  ): Promise<void> {
    const previousStatus = ride.status;
    this.assertTransitionAllowed(previousStatus, newStatus);

    ride.status = newStatus;
    ride.stateVersion = (ride.stateVersion ?? 0) + 1;
    await manager.getRepository(Ride).save(ride);

    const history = manager.getRepository(RideStatusHistory).create({
      rideId: ride.id,
      previousStatus,
      newStatus,
      actorType: context.actorType,
      actorUserId: context.actorUserId,
      metadata: context.metadata ?? null,
      occurredAt: context.occurredAt,
    });

    await manager.getRepository(RideStatusHistory).save(history);

    const eventType = this.outboxEventType(newStatus);
    if (eventType && this.outboxService) {
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE',
        aggregateId: ride.id,
        eventType,
        payload: {
          previousStatus,
          status: newStatus,
          stateVersion: ride.stateVersion,
          actorType: context.actorType,
          actorUserId: context.actorUserId,
          occurredAt: context.occurredAt.toISOString(),
        },
      });
    }
  }

  private outboxEventType(status: RideStatus): OutboxEventType | null {
    switch (status) {
      case RideStatus.DRIVER_ASSIGNED:
        return OutboxEventType.RIDE_ASSIGNED;
      case RideStatus.DRIVER_ARRIVING:
        return OutboxEventType.DRIVER_ARRIVING;
      case RideStatus.DRIVER_ARRIVED:
        return OutboxEventType.DRIVER_ARRIVED;
      case RideStatus.IN_PROGRESS:
        return OutboxEventType.RIDE_STARTED;
      case RideStatus.COMPLETED:
        return OutboxEventType.RIDE_COMPLETED;
      case RideStatus.CANCELLED:
        return OutboxEventType.RIDE_CANCELLED;
      case RideStatus.EXPIRED:
        return OutboxEventType.RIDE_EXPIRED;
      case RideStatus.SEARCHING_DRIVER:
        return OutboxEventType.RIDE_REQUESTED;
    }
  }

  private assertTransitionAllowed(
    previousStatus: RideStatus,
    newStatus: RideStatus,
  ): void {
    const allowed = ALLOWED_TRANSITIONS[previousStatus];

    if (!allowed.includes(newStatus)) {
      throw new ConflictException(
        `No se permite cambiar el viaje de ${previousStatus} a ${newStatus}`,
      );
    }
  }

  private async lockApprovedDriver(
    manager: EntityManager,
    driverUserId: string,
  ): Promise<DriverProfile> {
    const profile = await manager
      .getRepository(DriverProfile)
      .createQueryBuilder('profile')
      .where('profile.user_id = :driverUserId', { driverUserId })
      .setLock('pessimistic_write')
      .getOne();

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
  }

  private async lockRide(
    manager: EntityManager,
    rideId: string,
  ): Promise<Ride> {
    const ride = await manager.getRepository(Ride).findOne({
      where: { id: rideId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }

    return ride;
  }

  private assertAssignedDriver(ride: Ride, driverProfileId: string): void {
    if (ride.driverProfileId !== driverProfileId) {
      throw new NotFoundException(
        'El viaje no existe o no pertenece al conductor',
      );
    }
  }

  private async assertDriverBusy(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<void> {
    const state = await manager.getRepository(DriverOperationalState).findOne({
      where: { driverProfileId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!state || state.status !== DriverOperationalStatus.BUSY) {
      throw new ConflictException(
        'El conductor debe estar BUSY para actualizar el viaje asignado',
      );
    }
  }

  private async distanceToOrigin(
    manager: EntityManager,
    rideId: string,
    driverProfileId: string,
  ): Promise<number> {
    const rows = await manager.query<
      Array<{ distanceMeters: string | number | null }>
    >(
      `SELECT ST_Distance(location.position, ride.origin_position) AS "distanceMeters"
       FROM driver_locations location
       INNER JOIN rides ride ON ride.id = $1
       WHERE location.driver_profile_id = $2
       LIMIT 1`,
      [rideId, driverProfileId],
    );

    const value = Number(rows[0]?.distanceMeters);

    if (!Number.isFinite(value)) {
      throw new BadRequestException(
        'No fue posible calcular la distancia al punto de origen',
      );
    }

    return value;
  }

  private async restoreAvailability(driverProfileId: string): Promise<void> {
    try {
      const now = new Date();
      const [profile, vehicle, state, location, documents] = await Promise.all([
        this.dataSource.getRepository(DriverProfile).findOne({
          where: { id: driverProfileId },
        }),
        this.dataSource.getRepository(DriverVehicle).findOne({
          where: { driverProfileId },
        }),
        this.dataSource.getRepository(DriverOperationalState).findOne({
          where: { driverProfileId },
        }),
        this.dataSource.getRepository(DriverLocation).findOne({
          where: { driverProfileId },
        }),
        this.dataSource.getRepository(DriverDocument).find({
          where: { driverProfileId },
        }),
      ]);

      const requiredDocuments = new Map(
        documents.map((document) => [document.type, document]),
      );
      const license = requiredDocuments.get(DriverDocumentType.DRIVER_LICENSE);
      const soat = requiredDocuments.get(DriverDocumentType.SOAT);
      const today = now.toISOString().slice(0, 10);

      const eligible =
        profile?.status === DriverStatus.APPROVED &&
        vehicle?.status === VehicleStatus.APPROVED &&
        state?.status === DriverOperationalStatus.AVAILABLE &&
        location !== null &&
        now.getTime() - location.recordedAt.getTime() <=
          DRIVER_LOCATION_MAX_AGE_MS &&
        license?.status === DriverDocumentStatus.APPROVED &&
        soat?.status === DriverDocumentStatus.APPROVED &&
        Boolean(license.expiresAt && license.expiresAt >= today) &&
        Boolean(soat.expiresAt && soat.expiresAt >= today);

      if (!eligible || !location) {
        await this.availabilityRedisService.removeDriverAvailability(
          driverProfileId,
        );
        return;
      }

      await this.availabilityRedisService.publishAvailableDriver(
        driverProfileId,
        location.longitude,
        location.latitude,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `No pudo restaurarse la disponibilidad Redis de ${driverProfileId}: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  private emitStatusChangedSafely(
    ride: Ride,
    previousStatus: RideStatus,
  ): void {
    try {
      this.realtimeService.emitStatusChanged(ride, previousStatus);
    } catch (error: unknown) {
      this.logger.warn(
        `La transición ${previousStatus} -> ${ride.status} se confirmó, ` +
          `pero no pudo emitirse por WebSocket: ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
      );
    }
  }

  private emitCancelledSafely(ride: Ride): void {
    try {
      this.realtimeService.emitCancelled(ride);
    } catch (error: unknown) {
      this.logger.warn(
        `La cancelación del viaje ${ride.id} se confirmó, ` +
          `pero no pudo emitirse por WebSocket: ${
            error instanceof Error ? error.message : 'error desconocido'
          }`,
      );
    }
  }

  private mapTransition(ride: Ride): RideTransitionResponseDto {
    return {
      rideId: ride.id,
      status: ride.status,
      stateVersion: ride.stateVersion,
      driverArrivingAt: ride.driverArrivingAt,
      driverArrivedAt: ride.driverArrivedAt,
      arrivalDistanceMeters: ride.arrivalDistanceMeters,
    };
  }
}
