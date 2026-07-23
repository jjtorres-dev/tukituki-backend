import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RideStartResponseDto } from './dto/ride-start-response.dto';
import { RideStartCode } from './entities/ride-start-code.entity';
import { Ride } from './entities/ride.entity';
import { RideStartCodeStatus } from './enums/ride-start-code-status.enum';
import { RideStatusActor } from './enums/ride-status-actor.enum';
import { RideStatus } from './enums/ride-status.enum';
import {
  DRIVER_LOCATION_MAX_ACCURACY_METERS,
  DRIVER_LOCATION_MAX_AGE_MS,
  DRIVER_START_MAX_DISTANCE_METERS,
} from './ride-lifecycle.constants';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideStartCodesService } from './ride-start-codes.service';
import { RideTransitionsService } from './ride-transitions.service';

interface DistanceRow {
  distanceMeters: string | number | null;
}

interface StartedOutcome {
  kind: 'STARTED';
  ride: Ride;
  previousStatus: RideStatus;
}

interface IncorrectOutcome {
  kind: 'INCORRECT';
  remainingAttempts: number;
}

interface LockedOutcome {
  kind: 'LOCKED';
}

interface ExpiredOutcome {
  kind: 'EXPIRED';
}

const HTTP_STATUS_LOCKED = 423;

type StartRideOutcome =
  StartedOutcome | IncorrectOutcome | LockedOutcome | ExpiredOutcome;

@Injectable()
export class RideStartService {
  private readonly logger = new Logger(RideStartService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly startCodesService: RideStartCodesService,
    private readonly transitionsService: RideTransitionsService,
    private readonly realtimeService: RideRealtimeService,
  ) {}

  async startRide(
    driverUserId: string,
    rideId: string,
    providedCode: string,
  ): Promise<RideStartResponseDto> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<StartRideOutcome> => {
        const profile = await this.lockApprovedDriver(manager, driverUserId);
        const ride = await this.lockRide(manager, rideId);

        if (ride.driverProfileId !== profile.id) {
          throw new NotFoundException(
            'El viaje no existe o no pertenece al conductor',
          );
        }

        if (ride.status !== RideStatus.DRIVER_ARRIVED) {
          throw new ConflictException(
            'El viaje debe estar en DRIVER_ARRIVED para poder iniciarse',
          );
        }

        await this.assertDriverBusy(manager, profile.id);

        const startCode = await manager.getRepository(RideStartCode).findOne({
          where: { rideId: ride.id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!startCode) {
          throw new ConflictException(
            'El viaje no tiene un código de inicio disponible',
          );
        }

        const now = new Date();

        if (
          startCode.status === RideStartCodeStatus.ACTIVE &&
          startCode.expiresAt.getTime() <= now.getTime()
        ) {
          startCode.status = RideStartCodeStatus.EXPIRED;
          await manager.getRepository(RideStartCode).save(startCode);

          return { kind: 'EXPIRED' };
        }

        if (startCode.status === RideStartCodeStatus.EXPIRED) {
          return { kind: 'EXPIRED' };
        }

        if (startCode.status === RideStartCodeStatus.LOCKED) {
          return { kind: 'LOCKED' };
        }

        if (startCode.status !== RideStartCodeStatus.ACTIVE) {
          throw new ConflictException(
            'El código de inicio ya no se encuentra disponible',
          );
        }

        const location = await manager.getRepository(DriverLocation).findOne({
          where: { driverProfileId: profile.id },
          lock: { mode: 'pessimistic_read' },
        });
        const usableLocation = this.requireUsableLocation(location, now);

        const distanceMeters = await this.distanceToOrigin(
          manager,
          ride.id,
          profile.id,
        );

        if (distanceMeters > DRIVER_START_MAX_DISTANCE_METERS) {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            message:
              'Debes estar cerca del punto de origen para iniciar el viaje',
            distanceToOriginMeters: Math.round(distanceMeters),
            maximumStartDistanceMeters: DRIVER_START_MAX_DISTANCE_METERS,
            error: 'Bad Request',
          });
        }

        const expectedCode = this.startCodesService.deriveCode(startCode);

        if (!this.startCodesService.matchesCode(providedCode, expectedCode)) {
          startCode.failedAttempts += 1;
          const isLocked =
            startCode.failedAttempts >= startCode.maximumAttempts;

          if (isLocked) {
            startCode.status = RideStartCodeStatus.LOCKED;
            startCode.lockedAt = now;
          }

          await manager.getRepository(RideStartCode).save(startCode);

          if (isLocked) {
            return { kind: 'LOCKED' };
          }

          return {
            kind: 'INCORRECT',
            remainingAttempts: Math.max(
              0,
              startCode.maximumAttempts - startCode.failedAttempts,
            ),
          };
        }

        const previousStatus = ride.status;
        startCode.status = RideStartCodeStatus.USED;
        startCode.usedAt = now;
        ride.startedAt = now;

        await manager.getRepository(RideStartCode).save(startCode);
        await this.transitionsService.transitionWithinTransaction(
          manager,
          ride,
          RideStatus.IN_PROGRESS,
          {
            actorType: RideStatusActor.DRIVER,
            actorUserId: driverUserId,
            occurredAt: now,
            metadata: {
              rideStartCodeId: startCode.id,
              distanceToOriginMeters: distanceMeters.toFixed(2),
              locationRecordedAt: usableLocation.recordedAt.toISOString(),
              locationAccuracyMeters: usableLocation.accuracy,
            },
          },
        );

        return {
          kind: 'STARTED',
          ride,
          previousStatus,
        };
      },
    );

    if (outcome.kind === 'EXPIRED') {
      throw new HttpException(
        {
          statusCode: HttpStatus.GONE,
          message: 'El código de inicio venció; el pasajero debe regenerarlo',
          error: 'Gone',
        },
        HttpStatus.GONE,
      );
    }

    if (outcome.kind === 'LOCKED') {
      throw new HttpException(
        {
          statusCode: HTTP_STATUS_LOCKED,
          message: 'El código fue bloqueado por demasiados intentos',
          error: 'Locked',
        },
        HTTP_STATUS_LOCKED,
      );
    }

    if (outcome.kind === 'INCORRECT') {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'El código de inicio es incorrecto',
        remainingAttempts: outcome.remainingAttempts,
        error: 'Bad Request',
      });
    }

    this.emitStartedSafely(outcome.ride, outcome.previousStatus);

    if (!outcome.ride.startedAt) {
      throw new Error('El viaje iniciado no tiene startedAt');
    }

    return {
      rideId: outcome.ride.id,
      status: outcome.ride.status,
      stateVersion: outcome.ride.stateVersion,
      startedAt: outcome.ride.startedAt,
    };
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
        'El conductor debe estar BUSY para iniciar el viaje',
      );
    }
  }

  private requireUsableLocation(
    location: DriverLocation | null,
    now: Date,
  ): DriverLocation {
    if (!location) {
      throw new BadRequestException(
        'Debes registrar una ubicación GPS antes de iniciar el viaje',
      );
    }

    if (
      now.getTime() - location.recordedAt.getTime() >
      DRIVER_LOCATION_MAX_AGE_MS
    ) {
      throw new BadRequestException(
        'La ubicación GPS está vencida; actualízala antes de iniciar el viaje',
      );
    }

    if (
      location.accuracy === null ||
      location.accuracy > DRIVER_LOCATION_MAX_ACCURACY_METERS
    ) {
      throw new BadRequestException(
        'La precisión GPS no es suficiente para iniciar el viaje',
      );
    }

    return location;
  }

  private async distanceToOrigin(
    manager: EntityManager,
    rideId: string,
    driverProfileId: string,
  ): Promise<number> {
    const queryResult: unknown = await manager.query(
      `SELECT ST_Distance(location.position, ride.origin_position) AS "distanceMeters"
       FROM driver_locations location
       INNER JOIN rides ride ON ride.id = $1
       WHERE location.driver_profile_id = $2
       LIMIT 1`,
      [rideId, driverProfileId],
    );
    const rows = queryResult as DistanceRow[];
    const distanceMeters = Number(rows[0]?.distanceMeters);

    if (!Number.isFinite(distanceMeters)) {
      throw new BadRequestException(
        'No fue posible calcular la distancia al punto de origen',
      );
    }

    return distanceMeters;
  }

  private emitStartedSafely(ride: Ride, previousStatus: RideStatus): void {
    try {
      this.realtimeService.emitStatusChanged(ride, previousStatus);
    } catch (error: unknown) {
      this.logger.warn(
        `El inicio del viaje ${ride.id} se confirmó, pero no pudo emitirse ` +
          `ride.status.changed: ${this.errorMessage(error)}`,
      );
    }

    try {
      this.realtimeService.emitStarted(ride);
    } catch (error: unknown) {
      this.logger.warn(
        `El inicio del viaje ${ride.id} se confirmó, pero no pudo emitirse ` +
          `ride.started: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
