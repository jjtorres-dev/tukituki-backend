import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { DataSource, In, QueryFailedError } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { PromotionsService } from '../promotions/promotions.service';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { AdminRideCancellationQueryDto } from './dto/admin-ride-cancellation-query.dto';
import { DriverCancelRideDto } from './dto/driver-cancel-ride.dto';
import { DriverNoShowResponseDto } from './dto/driver-no-show-response.dto';
import { PassengerCancelRideDto } from './dto/passenger-cancel-ride.dto';
import { PassengerCancellationPreviewDto } from './dto/passenger-cancellation-preview.dto';
import {
  PassengerCancellationPreviewResponseDto,
  RideCancellationListResponseDto,
  RideCancellationResponseDto,
} from './dto/ride-cancellation-response.dto';
import { RideWaitingResponseDto } from './dto/ride-waiting-response.dto';
import { RideCancellation } from './entities/ride-cancellation.entity';
import { RideOffer } from './entities/ride-offer.entity';
import { RideWaiting } from './entities/ride-waiting.entity';
import { UserFinancialObligation } from './entities/user-financial-obligation.entity';
import { Ride } from './entities/ride.entity';
import { CancellationFeeStatus } from './enums/cancellation-fee-status.enum';
import { DriverCancellationReason } from './enums/driver-cancellation-reason.enum';
import { FinancialObligationStatus } from './enums/financial-obligation-status.enum';
import { FinancialObligationType } from './enums/financial-obligation-type.enum';
import { PassengerCancellationReason } from './enums/passenger-cancellation-reason.enum';
import { RideCancellationActor } from './enums/ride-cancellation-actor.enum';
import { RideCancellationType } from './enums/ride-cancellation-type.enum';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatusActor } from './enums/ride-status-actor.enum';
import { RideStatus } from './enums/ride-status.enum';
import { parseScaledDecimal } from '../fares/utils/fixed-decimal.util';
import {
  DRIVER_ARRIVAL_MAX_DISTANCE_METERS,
  DRIVER_LOCATION_MAX_ACCURACY_METERS,
  DRIVER_LOCATION_MAX_AGE_MS,
} from './ride-lifecycle.constants';
import { calculateRideSearchExpiresAt } from './ride-matching.constants';
import { CancellationFeeCalculatorService } from './cancellation-fee-calculator.service';
import { RideDispatchService } from './ride-dispatch.service';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideStartCodesService } from './ride-start-codes.service';
import { RideTransitionsService } from './ride-transitions.service';

const CANCELLABLE_STATUSES: readonly RideStatus[] = [
  RideStatus.SEARCHING_DRIVER,
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
];
const DRIVER_CANCELLABLE_STATUSES: readonly RideStatus[] = [
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
];

interface CancellationTransactionOutcome {
  ride: Ride;
  cancellation: RideCancellation;
  previousStatus: RideStatus;
  releasedDriverProfileId: string | null;
}

@Injectable()
export class RideCancellationsService {
  private readonly logger = new Logger(RideCancellationsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly feeCalculator: CancellationFeeCalculatorService,
    private readonly transitionsService: RideTransitionsService,
    private readonly rideStartCodesService: RideStartCodesService,
    private readonly rideDispatchService: RideDispatchService,
    private readonly realtimeService: RideRealtimeService,
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional()
    private readonly promotionsService?: PromotionsService,
  ) {}

  async previewPassengerCancellation(
    passengerUserId: string,
    rideId: string,
    dto: PassengerCancellationPreviewDto,
  ): Promise<PassengerCancellationPreviewResponseDto> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: { id: rideId, passengerUserId },
    });
    if (!ride) throw new NotFoundException('El viaje no existe');
    if (!CANCELLABLE_STATUSES.includes(ride.status)) {
      throw new BadRequestException(
        'El viaje ya no puede cancelarse mediante el flujo estándar',
      );
    }

    const calculation = this.feeCalculator.calculatePassengerFee(
      ride,
      new Date(),
    );
    return {
      rideId: ride.id,
      rideStatus: ride.status,
      canCancel: true,
      gracePeriodExpired: calculation.gracePeriodExpired,
      calculatedFee: calculation.fee,
      currency: ride.currency,
      reason: dto.reason,
      requiresConfirmation: parseScaledDecimal(calculation.fee, 2) > 0n,
    };
  }

  async cancelByPassenger(
    passengerUserId: string,
    rideId: string,
    dto: PassengerCancelRideDto,
  ): Promise<RideCancellationResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      await this.lockEnabledPassenger(manager, passengerUserId);
      const ride = await this.lockRide(manager, rideId);
      if (ride.passengerUserId !== passengerUserId) {
        throw new NotFoundException('El viaje no existe');
      }
      if (!CANCELLABLE_STATUSES.includes(ride.status)) {
        throw new BadRequestException(
          'El viaje ya no puede cancelarse mediante el flujo estándar',
        );
      }
      await this.assertNoCancellation(manager, ride.id);

      const now = new Date();
      const previousStatus = ride.status;
      const calculation = this.feeCalculator.calculatePassengerFee(ride, now);
      this.assertExpectedFee(dto.expectedFee, calculation.fee);
      const feeCents = parseScaledDecimal(calculation.fee, 2);
      const releasedDriverProfileId = await this.releaseAssignedDriver(
        manager,
        ride,
        now,
      );

      const cancellation = await this.createCancellation(manager, {
        ride,
        actorType: RideCancellationActor.PASSENGER,
        actorUserId: passengerUserId,
        reasonCode: dto.reason,
        reasonDetail: dto.reasonDetail,
        rideStatusBefore: previousStatus,
        cancellationType: RideCancellationType.PASSENGER_CANCELLED,
        fee: calculation.fee,
        feeStatus:
          feeCents > 0n
            ? CancellationFeeStatus.PENDING
            : CancellationFeeStatus.NOT_APPLICABLE,
        now,
        metadata: {
          gracePeriodExpired: calculation.gracePeriodExpired,
          releasedDriverProfileId,
        },
      });

      if (feeCents > 0n) {
        await this.createObligation(manager, {
          userId: passengerUserId,
          ride,
          cancellation,
          type: FinancialObligationType.PASSENGER_CANCELLATION_FEE,
          amount: calculation.fee,
          sourceSuffix: 'passenger-cancellation',
        });
      }

      await this.finalizeCancellation(manager, ride, cancellation, now, {
        actorType: RideStatusActor.PASSENGER,
        actorUserId: passengerUserId,
        cancellationReason: dto.reasonDetail ?? dto.reason,
        releasedDriverProfileId,
      });

      await this.enqueueCancellationEvents(manager, cancellation, ride, {
        eventType: OutboxEventType.RIDE_CANCELLED_BY_PASSENGER,
        driverProfileId: releasedDriverProfileId,
        feeUserId: feeCents > 0n ? passengerUserId : null,
      });

      return { ride, cancellation, previousStatus, releasedDriverProfileId };
    });

    await this.afterCancellation(outcome);
    return this.mapCancellation(outcome);
  }

  async cancelByDriver(
    driverUserId: string,
    rideId: string,
    dto: DriverCancelRideDto,
  ): Promise<RideCancellationResponseDto> {
    if (dto.reason === DriverCancellationReason.PASSENGER_NOT_FOUND) {
      throw new BadRequestException(
        'Usa el flujo de espera y no-show para reportar que el pasajero no apareció',
      );
    }

    const outcome = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedDriver(manager, driverUserId);
      const ride = await this.lockRide(manager, rideId);
      this.assertAssignedDriver(ride, profile.id);
      if (!DRIVER_CANCELLABLE_STATUSES.includes(ride.status)) {
        throw new BadRequestException(
          'El conductor ya no puede cancelar el viaje en su estado actual',
        );
      }
      await this.assertNoCancellation(manager, ride.id);

      const now = new Date();
      const previousStatus = ride.status;
      const releasedDriverProfileId = await this.releaseAssignedDriver(
        manager,
        ride,
        now,
      );
      const cancellation = await this.createCancellation(manager, {
        ride,
        actorType: RideCancellationActor.DRIVER,
        actorUserId: driverUserId,
        reasonCode: dto.reason,
        reasonDetail: dto.reasonDetail,
        rideStatusBefore: previousStatus,
        cancellationType: RideCancellationType.DRIVER_CANCELLED,
        fee: '0.00',
        feeStatus: CancellationFeeStatus.NOT_APPLICABLE,
        now,
        metadata: { releasedDriverProfileId },
      });

      await this.finalizeCancellation(manager, ride, cancellation, now, {
        actorType: RideStatusActor.DRIVER,
        actorUserId: driverUserId,
        cancellationReason: dto.reasonDetail ?? dto.reason,
        releasedDriverProfileId,
      });
      await this.enqueueCancellationEvents(manager, cancellation, ride, {
        eventType: OutboxEventType.RIDE_CANCELLED_BY_DRIVER,
        driverProfileId: releasedDriverProfileId,
        feeUserId: null,
      });
      return { ride, cancellation, previousStatus, releasedDriverProfileId };
    });

    await this.afterCancellation(outcome);
    return this.mapCancellation(outcome);
  }

  async startWaiting(
    driverUserId: string,
    rideId: string,
  ): Promise<RideWaitingResponseDto> {
    const waiting = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedDriver(manager, driverUserId);
      const ride = await this.lockRide(manager, rideId);
      this.assertAssignedDriver(ride, profile.id);
      if (ride.status !== RideStatus.DRIVER_ARRIVED) {
        throw new ConflictException(
          'La espera solo puede iniciarse después de registrar la llegada',
        );
      }
      await this.assertDriverBusy(manager, profile.id);
      const location = await this.lockFreshDriverLocation(manager, profile.id);
      const distanceMeters = await this.distanceToOrigin(
        manager,
        ride.id,
        profile.id,
      );
      if (distanceMeters > DRIVER_ARRIVAL_MAX_DISTANCE_METERS) {
        throw new BadRequestException(
          'Debes permanecer cerca del origen para iniciar la espera',
        );
      }

      const repository = manager.getRepository(RideWaiting);
      const existing = await repository.findOne({
        where: { rideId: ride.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing) return existing;

      const now = new Date();
      const requiredWaitingSeconds = ride.driverArrivalWaitSeconds ?? 300;
      const created = repository.create({
        rideId: ride.id,
        startedByDriverUserId: driverUserId,
        waitingStartedAt: now,
        noShowAvailableAt: new Date(
          now.getTime() + requiredWaitingSeconds * 1000,
        ),
        requiredWaitingSeconds,
        startDistanceMeters: distanceMeters.toFixed(2),
      });
      const saved = await repository.save(created);

      if (this.outboxService) {
        await this.outboxService.enqueueWithinTransaction(manager, {
          aggregateType: 'RIDE',
          aggregateId: ride.id,
          eventType: OutboxEventType.PASSENGER_WAITING_STARTED,
          payload: {
            driverUserId,
            passengerUserId: ride.passengerUserId,
            noShowAvailableAt: saved.noShowAvailableAt.toISOString(),
            locationRecordedAt: location.recordedAt.toISOString(),
          },
        });
      }
      return saved;
    });

    this.realtimeService.emitWaitingStarted(waiting);
    return this.mapWaiting(waiting);
  }

  async getWaiting(
    driverUserId: string,
    rideId: string,
  ): Promise<RideWaitingResponseDto> {
    const profile = await this.getApprovedDriver(driverUserId);
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: { id: rideId, driverProfileId: profile.id },
    });
    if (!ride) throw new NotFoundException('El viaje no existe');
    const waiting = await this.dataSource.getRepository(RideWaiting).findOne({
      where: { rideId },
    });
    if (!waiting)
      throw new NotFoundException('La espera todavía no fue iniciada');
    return this.mapWaiting(waiting);
  }

  async confirmPassengerNoShow(
    driverUserId: string,
    rideId: string,
    reasonDetail?: string,
  ): Promise<RideCancellationResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const profile = await this.lockApprovedDriver(manager, driverUserId);
      const ride = await this.lockRide(manager, rideId);
      this.assertAssignedDriver(ride, profile.id);
      if (ride.status !== RideStatus.DRIVER_ARRIVED) {
        throw new ConflictException(
          'El no-show solo puede confirmarse mientras el conductor espera en el origen',
        );
      }
      await this.assertDriverBusy(manager, profile.id);
      await this.assertNoCancellation(manager, ride.id);

      const waiting = await manager.getRepository(RideWaiting).findOne({
        where: { rideId: ride.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!waiting) {
        throw new ConflictException(
          'Primero debes iniciar el tiempo de espera',
        );
      }
      const now = new Date();
      if (waiting.noShowAvailableAt.getTime() > now.getTime()) {
        throw new ConflictException({
          message: 'Todavía no se cumplió el tiempo mínimo de espera',
          noShowAvailableAt: waiting.noShowAvailableAt,
          remainingSeconds: Math.ceil(
            (waiting.noShowAvailableAt.getTime() - now.getTime()) / 1000,
          ),
        });
      }

      await this.lockFreshDriverLocation(manager, profile.id);
      const distanceMeters = await this.distanceToOrigin(
        manager,
        ride.id,
        profile.id,
      );
      if (distanceMeters > DRIVER_ARRIVAL_MAX_DISTANCE_METERS) {
        throw new BadRequestException(
          'Debes permanecer cerca del origen para confirmar el no-show',
        );
      }

      const previousStatus = ride.status;
      const fee = this.feeCalculator.passengerNoShowFee(ride);
      const feeCents = parseScaledDecimal(fee, 2);
      const compensation = this.feeCalculator.driverCompensation(ride);
      const compensationCents = parseScaledDecimal(compensation, 2);
      const releasedDriverProfileId = await this.releaseAssignedDriver(
        manager,
        ride,
        now,
      );
      const waitingSeconds = Math.max(
        0,
        Math.floor((now.getTime() - waiting.waitingStartedAt.getTime()) / 1000),
      );
      const cancellation = await this.createCancellation(manager, {
        ride,
        actorType: RideCancellationActor.DRIVER,
        actorUserId: driverUserId,
        reasonCode: DriverCancellationReason.PASSENGER_NOT_FOUND,
        reasonDetail,
        rideStatusBefore: previousStatus,
        cancellationType: RideCancellationType.PASSENGER_NO_SHOW,
        fee,
        feeStatus:
          feeCents > 0n
            ? CancellationFeeStatus.PENDING
            : CancellationFeeStatus.NOT_APPLICABLE,
        now,
        distanceToReferenceMeters: distanceMeters.toFixed(2),
        waitingSeconds,
        metadata: { compensation, releasedDriverProfileId },
      });

      if (feeCents > 0n) {
        await this.createObligation(manager, {
          userId: ride.passengerUserId,
          ride,
          cancellation,
          type: FinancialObligationType.PASSENGER_NO_SHOW_FEE,
          amount: fee,
          sourceSuffix: 'passenger-no-show-fee',
        });
      }
      if (compensationCents > 0n) {
        await this.createObligation(manager, {
          userId: driverUserId,
          ride,
          cancellation,
          type: FinancialObligationType.DRIVER_COMPENSATION,
          amount: compensation,
          sourceSuffix: 'driver-compensation',
        });
      }

      await this.finalizeCancellation(manager, ride, cancellation, now, {
        actorType: RideStatusActor.DRIVER,
        actorUserId: driverUserId,
        cancellationReason: reasonDetail ?? 'Pasajero no encontrado',
        releasedDriverProfileId,
      });
      await this.enqueueCancellationEvents(manager, cancellation, ride, {
        eventType: OutboxEventType.PASSENGER_NO_SHOW_CONFIRMED,
        driverProfileId: releasedDriverProfileId,
        feeUserId: feeCents > 0n ? ride.passengerUserId : null,
      });
      return { ride, cancellation, previousStatus, releasedDriverProfileId };
    });

    await this.afterCancellation(outcome);
    return this.mapCancellation(outcome);
  }

  async reportDriverNoShow(
    passengerUserId: string,
    rideId: string,
    continueSearching: boolean,
    reasonDetail?: string,
  ): Promise<DriverNoShowResponseDto> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      await this.lockEnabledPassenger(manager, passengerUserId);
      const ride = await this.lockRide(manager, rideId);
      if (ride.passengerUserId !== passengerUserId) {
        throw new NotFoundException('El viaje no existe');
      }
      if (
        ![RideStatus.DRIVER_ASSIGNED, RideStatus.DRIVER_ARRIVING].includes(
          ride.status,
        ) ||
        !ride.driverProfileId ||
        !ride.driverAssignedAt
      ) {
        throw new ConflictException(
          'El viaje no permite reportar falta de progreso del conductor',
        );
      }

      const now = new Date();
      const requiredSeconds = ride.driverNoProgressSeconds ?? 180;
      const elapsedSeconds = Math.floor(
        (now.getTime() - ride.driverAssignedAt.getTime()) / 1000,
      );
      if (elapsedSeconds < requiredSeconds) {
        throw new ConflictException({
          message: 'Todavía no transcurrió el tiempo mínimo de verificación',
          remainingSeconds: requiredSeconds - elapsedSeconds,
        });
      }

      const previousDriverProfileId = ride.driverProfileId;
      const state = await manager
        .getRepository(DriverOperationalState)
        .findOne({
          where: { driverProfileId: previousDriverProfileId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!state)
        throw new ConflictException('El estado del conductor no existe');

      const location = await manager.getRepository(DriverLocation).findOne({
        where: { driverProfileId: previousDriverProfileId },
        lock: { mode: 'pessimistic_read' },
      });
      const stale =
        !location ||
        now.getTime() - location.recordedAt.getTime() >
          DRIVER_LOCATION_MAX_AGE_MS;
      const acceptedOffer = await manager.getRepository(RideOffer).findOne({
        where: {
          rideId: ride.id,
          driverProfileId: previousDriverProfileId,
          status: RideOfferStatus.ACCEPTED,
        },
        lock: { mode: 'pessimistic_write' },
      });
      let currentDistanceMeters: number | null = null;
      let progressMeters: number | null = null;
      if (location) {
        currentDistanceMeters = await this.distanceToOrigin(
          manager,
          ride.id,
          previousDriverProfileId,
        );
      }
      if (currentDistanceMeters !== null && acceptedOffer) {
        progressMeters = Math.max(
          0,
          Math.round(
            acceptedOffer.distanceToOriginMeters - currentDistanceMeters,
          ),
        );
      }

      const driverIsBusy = state.status === DriverOperationalStatus.BUSY;
      if (
        driverIsBusy &&
        !stale &&
        currentDistanceMeters !== null &&
        currentDistanceMeters <= DRIVER_ARRIVAL_MAX_DISTANCE_METERS
      ) {
        throw new ConflictException({
          message: 'El conductor se encuentra cerca del punto de origen',
          distanceToOriginMeters: Math.round(currentDistanceMeters),
          maximumArrivalDistanceMeters: DRIVER_ARRIVAL_MAX_DISTANCE_METERS,
        });
      }

      const minimumProgress = ride.driverNoProgressMinMeters ?? 100;
      if (driverIsBusy && !stale && (progressMeters ?? 0) >= minimumProgress) {
        throw new ConflictException({
          message: 'El conductor registra progreso hacia el origen',
          progressMeters,
          minimumProgressMeters: minimumProgress,
        });
      }

      const previousStatus = ride.status;
      const shouldRemainOffline =
        stale || state.status === DriverOperationalStatus.OFFLINE;
      state.status = shouldRemainOffline
        ? DriverOperationalStatus.OFFLINE
        : DriverOperationalStatus.AVAILABLE;
      state.disconnectedAt = shouldRemainOffline
        ? (state.disconnectedAt ?? now)
        : null;
      await manager.getRepository(DriverOperationalState).save(state);

      await manager.getRepository(RideOffer).update(
        {
          rideId: ride.id,
          status: In([RideOfferStatus.OFFERED, RideOfferStatus.ACCEPTED]),
        },
        {
          status: RideOfferStatus.CANCELLED,
          respondedAt: now,
          cancelledAt: now,
          rejectionReason: 'DRIVER_NO_SHOW',
        },
      );

      if (continueSearching) {
        ride.driverProfileId = null;
        ride.driverAssignedAt = null;
        ride.driverArrivingAt = null;
        ride.driverArrivedAt = null;
        ride.arrivalDistanceMeters = null;
        ride.dispatchRound = 0;
        ride.lastDispatchAt = null;
        ride.searchExpiresAt = calculateRideSearchExpiresAt(now);
        await this.transitionsService.transitionWithinTransaction(
          manager,
          ride,
          RideStatus.SEARCHING_DRIVER,
          {
            actorType: RideStatusActor.PASSENGER,
            actorUserId: passengerUserId,
            occurredAt: now,
            metadata: {
              driverNoShow: true,
              previousDriverProfileId,
              progressMeters,
              currentDistanceMeters,
              staleLocation: stale,
              reasonDetail: reasonDetail ?? null,
            },
          },
        );
      } else {
        await this.assertNoCancellation(manager, ride.id);
        const cancellation = await this.createCancellation(manager, {
          ride,
          actorType: RideCancellationActor.PASSENGER,
          actorUserId: passengerUserId,
          reasonCode: PassengerCancellationReason.DRIVER_NOT_MOVING,
          reasonDetail,
          rideStatusBefore: previousStatus,
          cancellationType: RideCancellationType.DRIVER_NO_SHOW_CANCELLED,
          fee: '0.00',
          feeStatus: CancellationFeeStatus.NOT_APPLICABLE,
          now,
          metadata: {
            previousDriverProfileId,
            progressMeters,
            currentDistanceMeters,
            staleLocation: stale,
          },
        });
        await this.finalizeCancellation(manager, ride, cancellation, now, {
          actorType: RideStatusActor.PASSENGER,
          actorUserId: passengerUserId,
          cancellationReason: reasonDetail ?? 'Conductor sin progreso',
          releasedDriverProfileId: previousDriverProfileId,
        });
      }

      if (this.outboxService) {
        const previousDriverUserId = await this.driverUserId(
          manager,
          previousDriverProfileId,
        );
        await this.outboxService.enqueueWithinTransaction(manager, {
          aggregateType: 'RIDE',
          aggregateId: ride.id,
          eventType: OutboxEventType.DRIVER_NO_SHOW_CONFIRMED,
          payload: {
            passengerUserId,
            previousDriverProfileId,
            driverUserId: previousDriverUserId,
            rematching: continueSearching,
            progressMeters,
            currentDistanceMeters,
            staleLocation: stale,
          },
        });
        if (previousDriverUserId) {
          await this.outboxService.enqueueWithinTransaction(manager, {
            aggregateType: 'RIDE',
            aggregateId: ride.id,
            eventType: OutboxEventType.DRIVER_RELEASED,
            payload: {
              driverUserId: previousDriverUserId,
              driverProfileId: previousDriverProfileId,
            },
          });
        }
        if (continueSearching) {
          await this.outboxService.enqueueWithinTransaction(manager, {
            aggregateType: 'RIDE',
            aggregateId: ride.id,
            eventType: OutboxEventType.RIDE_REMATCH_REQUESTED,
            payload: { passengerUserId, previousDriverProfileId },
          });
        }
      }

      return {
        ride,
        previousStatus,
        previousDriverProfileId,
        driverOperationalStatus: state.status,
        progressMeters,
        rematching: continueSearching,
      };
    });

    await this.availabilityRedisService.removeDriverAvailability(
      outcome.previousDriverProfileId,
    );
    if (outcome.driverOperationalStatus === DriverOperationalStatus.AVAILABLE) {
      await this.transitionsService.restoreDriverAvailability(
        outcome.previousDriverProfileId,
      );
    }
    this.emitStatusChangedSafely(outcome.ride, outcome.previousStatus);
    if (outcome.rematching) {
      this.emitRematchingSafely(outcome.ride, outcome.previousDriverProfileId);
      await this.dispatchRideSafely(outcome.ride.id);
    } else {
      this.emitCancelledSafely(outcome.ride);
    }

    return {
      rideId: outcome.ride.id,
      status: outcome.ride.status,
      rematching: outcome.rematching,
      driverOperationalStatus: outcome.driverOperationalStatus,
      progressMeters: outcome.progressMeters,
      stateVersion: outcome.ride.stateVersion,
    };
  }

  async listAdmin(
    query: AdminRideCancellationQueryDto,
  ): Promise<RideCancellationListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const repository = this.dataSource.getRepository(RideCancellation);
    const where = {
      ...(query.cancellationType
        ? { cancellationType: query.cancellationType }
        : {}),
      ...(query.feeStatus ? { feeStatus: query.feeStatus } : {}),
    };
    const [rows, totalItems] = await repository.findAndCount({
      where,
      relations: { ride: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: rows.map((row) => this.mapCancellationEntity(row, row.ride)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
      },
    };
  }

  async getAdmin(cancellationId: string): Promise<RideCancellationResponseDto> {
    const cancellation = await this.dataSource
      .getRepository(RideCancellation)
      .findOne({ where: { id: cancellationId }, relations: { ride: true } });
    if (!cancellation) throw new NotFoundException('La cancelación no existe');
    return this.mapCancellationEntity(cancellation, cancellation.ride);
  }

  async waiveFee(
    adminUserId: string,
    cancellationId: string,
    reason: string,
  ): Promise<RideCancellationResponseDto> {
    const result = await this.dataSource.transaction(async (manager) => {
      const cancellation = await manager
        .getRepository(RideCancellation)
        .findOne({
          where: { id: cancellationId },
          relations: { ride: true },
          lock: { mode: 'pessimistic_write' },
        });
      if (!cancellation)
        throw new NotFoundException('La cancelación no existe');
      if (cancellation.feeStatus !== CancellationFeeStatus.PENDING) {
        throw new ConflictException('La tarifa ya no puede ser exonerada');
      }
      const now = new Date();
      cancellation.waivedAmount = cancellation.chargedFee;
      cancellation.chargedFee = '0.00';
      cancellation.feeStatus = CancellationFeeStatus.WAIVED;
      cancellation.metadata = {
        ...(cancellation.metadata ?? {}),
        waivedByUserId: adminUserId,
        waivedReason: reason,
        waivedAt: now.toISOString(),
      };
      await manager.getRepository(RideCancellation).save(cancellation);
      await manager.getRepository(UserFinancialObligation).update(
        {
          cancellationId: cancellation.id,
          obligationType: In([
            FinancialObligationType.PASSENGER_CANCELLATION_FEE,
            FinancialObligationType.PASSENGER_NO_SHOW_FEE,
          ]),
          status: FinancialObligationStatus.PENDING,
        },
        { status: FinancialObligationStatus.WAIVED, resolvedAt: now },
      );
      if (this.outboxService) {
        await this.outboxService.enqueueWithinTransaction(manager, {
          aggregateType: 'RIDE',
          aggregateId: cancellation.rideId,
          eventType: OutboxEventType.CANCELLATION_FEE_WAIVED,
          payload: {
            cancellationId: cancellation.id,
            passengerUserId: cancellation.ride.passengerUserId,
            waivedByUserId: adminUserId,
          },
        });
      }
      return cancellation;
    });
    return this.mapCancellationEntity(result, result.ride);
  }

  private async finalizeCancellation(
    manager: EntityManager,
    ride: Ride,
    cancellation: RideCancellation,
    now: Date,
    input: {
      actorType: RideStatusActor;
      actorUserId: string;
      cancellationReason: string;
      releasedDriverProfileId: string | null;
    },
  ): Promise<void> {
    ride.cancelledAt = now;
    ride.cancelledBy = cancellation.actorType;
    ride.cancellationReason = input.cancellationReason;
    await this.transitionsService.transitionWithinTransaction(
      manager,
      ride,
      RideStatus.CANCELLED,
      {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        occurredAt: now,
        metadata: {
          advancedCancellation: true,
          cancellationId: cancellation.id,
          cancellationType: cancellation.cancellationType,
          chargedFee: cancellation.chargedFee,
          feeStatus: cancellation.feeStatus,
          releasedDriverProfileId: input.releasedDriverProfileId,
        },
      },
    );
    await manager.getRepository(RideOffer).update(
      {
        rideId: ride.id,
        status: In([
          RideOfferStatus.OFFERED,
          RideOfferStatus.PROPOSED,
          RideOfferStatus.ACCEPTED,
        ]),
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
  }

  private async createCancellation(
    manager: EntityManager,
    input: {
      ride: Ride;
      actorType: RideCancellationActor;
      actorUserId: string;
      reasonCode: string;
      reasonDetail?: string;
      rideStatusBefore: RideStatus;
      cancellationType: RideCancellationType;
      fee: string;
      feeStatus: CancellationFeeStatus;
      now: Date;
      distanceToReferenceMeters?: string;
      waitingSeconds?: number;
      metadata: Record<string, unknown>;
    },
  ): Promise<RideCancellation> {
    await this.promotionsService?.releaseWithinTransaction(
      manager,
      input.ride.id,
      input.reasonCode,
      input.now,
    );
    const repository = manager.getRepository(RideCancellation);
    const entity = repository.create({
      rideId: input.ride.id,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      reasonCode: input.reasonCode,
      reasonDetail: input.reasonDetail?.trim() || null,
      rideStatusBefore: input.rideStatusBefore,
      cancellationType: input.cancellationType,
      calculatedFee: input.fee,
      chargedFee: input.fee,
      waivedAmount: '0.00',
      currency: input.ride.currency,
      feeStatus: input.feeStatus,
      distanceToReferenceMeters: input.distanceToReferenceMeters ?? null,
      waitingSeconds: input.waitingSeconds ?? null,
      metadata: input.metadata,
      createdAt: input.now,
      updatedAt: input.now,
    });
    try {
      return await repository.save(entity);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'El viaje ya tiene una cancelación registrada',
        );
      }
      throw error;
    }
  }

  private async createObligation(
    manager: EntityManager,
    input: {
      userId: string;
      ride: Ride;
      cancellation: RideCancellation;
      type: FinancialObligationType;
      amount: string;
      sourceSuffix: string;
    },
  ): Promise<void> {
    const repository = manager.getRepository(UserFinancialObligation);
    const obligation = repository.create({
      userId: input.userId,
      rideId: input.ride.id,
      cancellationId: input.cancellation.id,
      obligationType: input.type,
      amount: input.amount,
      currency: input.ride.currency,
      status: FinancialObligationStatus.PENDING,
      sourceReference: `${input.ride.id}:${input.sourceSuffix}`,
      resolvedAt: null,
    });
    try {
      await repository.save(obligation);
    } catch (error: unknown) {
      if (!this.isUniqueViolation(error)) throw error;
    }
  }

  private async enqueueCancellationEvents(
    manager: EntityManager,
    cancellation: RideCancellation,
    ride: Ride,
    input: {
      eventType: OutboxEventType;
      driverProfileId: string | null;
      feeUserId: string | null;
    },
  ): Promise<void> {
    if (!this.outboxService) return;
    const driverUserId = input.driverProfileId
      ? await this.driverUserId(manager, input.driverProfileId)
      : null;
    await this.outboxService.enqueueWithinTransaction(manager, {
      aggregateType: 'RIDE',
      aggregateId: ride.id,
      eventType: input.eventType,
      payload: {
        cancellationId: cancellation.id,
        passengerUserId: ride.passengerUserId,
        driverUserId,
        cancellationType: cancellation.cancellationType,
        chargedFee: cancellation.chargedFee,
        currency: cancellation.currency,
      },
    });
    if (input.feeUserId) {
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE',
        aggregateId: ride.id,
        eventType: OutboxEventType.CANCELLATION_FEE_CREATED,
        payload: {
          cancellationId: cancellation.id,
          userId: input.feeUserId,
          amount: cancellation.chargedFee,
          currency: cancellation.currency,
        },
      });
    }
    if (driverUserId) {
      await this.outboxService.enqueueWithinTransaction(manager, {
        aggregateType: 'RIDE',
        aggregateId: ride.id,
        eventType: OutboxEventType.DRIVER_RELEASED,
        payload: { driverUserId, driverProfileId: input.driverProfileId },
      });
    }
  }

  private async afterCancellation(
    outcome: CancellationTransactionOutcome,
  ): Promise<void> {
    if (outcome.releasedDriverProfileId) {
      await this.transitionsService.restoreDriverAvailability(
        outcome.releasedDriverProfileId,
      );
    }
    this.emitStatusChangedSafely(outcome.ride, outcome.previousStatus);
    this.emitCancelledSafely(outcome.ride);
  }

  private async releaseAssignedDriver(
    manager: EntityManager,
    ride: Ride,
    now: Date,
  ): Promise<string | null> {
    if (!ride.driverProfileId) return null;
    const state = await manager.getRepository(DriverOperationalState).findOne({
      where: { driverProfileId: ride.driverProfileId },
      lock: { mode: 'pessimistic_write' },
    });
    if (state?.status === DriverOperationalStatus.BUSY) {
      state.status = DriverOperationalStatus.AVAILABLE;
      state.lastSeenAt = now;
      state.disconnectedAt = null;
      await manager.getRepository(DriverOperationalState).save(state);
    }
    return ride.driverProfileId;
  }

  private async lockFreshDriverLocation(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<DriverLocation> {
    const location = await manager.getRepository(DriverLocation).findOne({
      where: { driverProfileId },
      lock: { mode: 'pessimistic_read' },
    });
    if (!location)
      throw new BadRequestException('Debes registrar tu ubicación GPS');
    const age = Date.now() - location.recordedAt.getTime();
    if (age > DRIVER_LOCATION_MAX_AGE_MS) {
      throw new BadRequestException('La ubicación GPS está vencida');
    }
    if (
      location.accuracy === null ||
      location.accuracy > DRIVER_LOCATION_MAX_ACCURACY_METERS
    ) {
      throw new BadRequestException('La precisión GPS no es suficiente');
    }
    return location;
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
        'No fue posible calcular la distancia al origen',
      );
    }
    return value;
  }

  private async assertNoCancellation(
    manager: EntityManager,
    rideId: string,
  ): Promise<void> {
    const existing = await manager.getRepository(RideCancellation).findOne({
      where: { rideId },
      lock: { mode: 'pessimistic_read' },
    });
    if (existing) throw new ConflictException('El viaje ya fue cancelado');
  }

  private assertExpectedFee(
    expected: string | undefined,
    actual: string,
  ): void {
    if (expected === undefined) return;
    if (parseScaledDecimal(expected, 2) !== parseScaledDecimal(actual, 2)) {
      throw new ConflictException({
        message:
          'La tarifa de cancelación cambió; solicita una nueva vista previa',
        expectedFee: expected,
        currentFee: actual,
      });
    }
  }

  private async lockEnabledPassenger(
    manager: EntityManager,
    userId: string,
  ): Promise<User> {
    const user = await manager.getRepository(User).findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!user) throw new NotFoundException('El pasajero no existe');
    if (
      user.status !== UserStatus.ACTIVE ||
      !user.roles.includes(UserRole.PASSENGER)
    ) {
      throw new ForbiddenException('La cuenta del pasajero no está habilitada');
    }
    return user;
  }

  private async lockApprovedDriver(
    manager: EntityManager,
    userId: string,
  ): Promise<DriverProfile> {
    const profile = await manager
      .getRepository(DriverProfile)
      .createQueryBuilder('profile')
      .where('profile.user_id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOne();
    if (!profile)
      throw new NotFoundException('El perfil de conductor no existe');
    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }
    return profile;
  }

  private async getApprovedDriver(userId: string): Promise<DriverProfile> {
    const profile = await this.dataSource
      .getRepository(DriverProfile)
      .findOne({ where: { userId } });
    if (!profile)
      throw new NotFoundException('El perfil de conductor no existe');
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
    if (!ride) throw new NotFoundException('El viaje no existe');
    return ride;
  }

  private assertAssignedDriver(ride: Ride, driverProfileId: string): void {
    if (ride.driverProfileId !== driverProfileId) {
      throw new NotFoundException('El viaje no pertenece al conductor');
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
      throw new ConflictException('El conductor debe estar BUSY');
    }
  }

  private async driverUserId(
    manager: EntityManager,
    driverProfileId: string,
  ): Promise<string | null> {
    const profile = await manager.getRepository(DriverProfile).findOne({
      where: { id: driverProfileId },
      select: { userId: true },
    });
    return profile?.userId ?? null;
  }

  private async dispatchRideSafely(rideId: string): Promise<void> {
    try {
      await this.rideDispatchService.dispatchRide(rideId);
    } catch (error: unknown) {
      this.logger.warn(
        `El rematching del viaje ${rideId} quedó confirmado, pero el despacho ` +
          `inmediato falló: ${this.errorMessage(error)}. El worker lo reintentará.`,
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
        `No pudo emitirse el cambio de estado del viaje ${ride.id}: ` +
          this.errorMessage(error),
      );
    }
  }

  private emitCancelledSafely(ride: Ride): void {
    try {
      this.realtimeService.emitCancelled(ride);
    } catch (error: unknown) {
      this.logger.warn(
        `La cancelación del viaje ${ride.id} fue confirmada, pero el evento ` +
          `WebSocket falló: ${this.errorMessage(error)}`,
      );
    }
  }

  private emitRematchingSafely(
    ride: Ride,
    previousDriverProfileId: string,
  ): void {
    try {
      this.realtimeService.emitRematching(ride, previousDriverProfileId);
    } catch (error: unknown) {
      this.logger.warn(
        `El rematching del viaje ${ride.id} fue confirmado, pero el evento ` +
          `WebSocket falló: ${this.errorMessage(error)}`,
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }

  private mapWaiting(waiting: RideWaiting): RideWaitingResponseDto {
    const now = Date.now();
    const elapsedWaitingSeconds = Math.max(
      0,
      Math.floor((now - waiting.waitingStartedAt.getTime()) / 1000),
    );
    const remainingWaitingSeconds = Math.max(
      0,
      Math.ceil((waiting.noShowAvailableAt.getTime() - now) / 1000),
    );
    return {
      rideId: waiting.rideId,
      waitingStartedAt: waiting.waitingStartedAt,
      noShowAvailableAt: waiting.noShowAvailableAt,
      requiredWaitingSeconds: waiting.requiredWaitingSeconds,
      elapsedWaitingSeconds,
      remainingWaitingSeconds,
      canReportNoShow: remainingWaitingSeconds === 0,
      startDistanceMeters: waiting.startDistanceMeters,
    };
  }

  private mapCancellation(
    outcome: CancellationTransactionOutcome,
  ): RideCancellationResponseDto {
    return this.mapCancellationEntity(outcome.cancellation, outcome.ride);
  }

  private mapCancellationEntity(
    cancellation: RideCancellation,
    ride: Ride,
  ): RideCancellationResponseDto {
    return {
      id: cancellation.id,
      rideId: cancellation.rideId,
      rideStatusBefore: cancellation.rideStatusBefore,
      status: ride.status,
      actorType: cancellation.actorType,
      cancellationType: cancellation.cancellationType,
      reasonCode: cancellation.reasonCode,
      reasonDetail: cancellation.reasonDetail,
      calculatedFee: cancellation.calculatedFee,
      chargedFee: cancellation.chargedFee,
      waivedAmount: cancellation.waivedAmount,
      feeStatus: cancellation.feeStatus,
      currency: cancellation.currency,
      distanceToReferenceMeters: cancellation.distanceToReferenceMeters,
      waitingSeconds: cancellation.waitingSeconds,
      stateVersion: ride.stateVersion,
      cancelledAt: ride.cancelledAt ?? cancellation.createdAt,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === '23505';
  }
}
