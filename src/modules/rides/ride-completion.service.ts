import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { FareQuote } from '../fares/entities/fare-quote.entity';
import {
  applyMultiplierToCents,
  calculateDistanceAmountCents,
  calculateTimeAmountCents,
  divideRoundHalfUp,
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { CompleteRideDto } from './dto/complete-ride.dto';
import { RideCompletionResponseDto } from './dto/ride-completion-response.dto';
import { RideFinalFare } from './entities/ride-final-fare.entity';
import { RideProgressMetrics } from './entities/ride-progress-metrics.entity';
import { Ride } from './entities/ride.entity';
import { RideStatusActor } from './enums/ride-status-actor.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideTransitionsService } from './ride-transitions.service';

const COMPLETION_MAX_DISTANCE_METERS = 250;
const LOCATION_MAX_AGE_MS = 45_000;
const LOCATION_MAX_ACCURACY_METERS = 50;

interface DistanceRow {
  distanceMeters: string | number | null;
}

interface FareCalculation {
  baseFare: string;
  distanceAmount: string;
  timeAmount: string;
  bookingFee: string;
  subtotal: string;
  adjustmentMultiplier: string;
  calculatedFinalFare: string;
  finalFare: string;
  fareCapAmount: string;
  fareWasCapped: boolean;
  currency: string;
  calculationVersion: string;
}

interface CompletionOutcome {
  ride: Ride;
  previousStatus: RideStatus;
  finalFare: RideFinalFare;
  location: DriverLocation;
}

@Injectable()
export class RideCompletionService {
  private readonly logger = new Logger(RideCompletionService.name);
  private readonly maxIncreasePercent: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly transitionsService: RideTransitionsService,
    private readonly realtimeService: RideRealtimeService,
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
  ) {
    const configured = Number(
      this.configService.get<string>('RIDE_FINAL_FARE_MAX_INCREASE_PERCENT') ??
        '20',
    );
    this.maxIncreasePercent =
      Number.isInteger(configured) && configured >= 0 && configured <= 100
        ? configured
        : 20;
  }

  async completeRide(
    driverUserId: string,
    rideId: string,
    dto: CompleteRideDto,
  ): Promise<RideCompletionResponseDto> {
    const outcome = await this.dataSource.transaction(
      async (manager): Promise<CompletionOutcome> => {
        const profile = await this.lockApprovedDriver(manager, driverUserId);
        const ride = await manager.getRepository(Ride).findOne({
          where: { id: rideId },
          lock: { mode: 'pessimistic_write' },
        });

        if (!ride || ride.driverProfileId !== profile.id) {
          throw new NotFoundException(
            'El viaje no existe o no pertenece al conductor',
          );
        }

        if (ride.status !== RideStatus.IN_PROGRESS || !ride.startedAt) {
          throw new ConflictException(
            'El viaje debe estar en IN_PROGRESS para finalizarse',
          );
        }

        const state = await manager
          .getRepository(DriverOperationalState)
          .findOne({
            where: { driverProfileId: profile.id },
            lock: { mode: 'pessimistic_write' },
          });

        if (!state || state.status !== DriverOperationalStatus.BUSY) {
          throw new ConflictException(
            'El conductor debe estar BUSY para finalizar el viaje',
          );
        }

        const location = await manager.getRepository(DriverLocation).findOne({
          where: { driverProfileId: profile.id },
          lock: { mode: 'pessimistic_read' },
        });
        const now = new Date();
        this.assertUsableLocation(location, now);

        const destinationDistance = await this.distanceToDestination(
          manager,
          ride.id,
          profile.id,
        );

        if (destinationDistance > COMPLETION_MAX_DISTANCE_METERS) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'Debes estar cerca del destino para finalizar el viaje',
            distanceToDestinationMeters: Math.round(destinationDistance),
            maximumCompletionDistanceMeters: COMPLETION_MAX_DISTANCE_METERS,
            error: 'Bad Request',
          });
        }

        const metrics = await manager
          .getRepository(RideProgressMetrics)
          .findOne({
            where: { rideId: ride.id },
            lock: { mode: 'pessimistic_write' },
          });

        if (!metrics) {
          throw new ConflictException(
            'El viaje no tiene métricas de progreso inicializadas',
          );
        }

        const trackedDistanceMeters = Math.max(
          0,
          Math.round(Number(metrics.trackedDistanceMeters)),
        );
        const actualDurationSeconds = Math.max(
          1,
          Math.floor((now.getTime() - ride.startedAt.getTime()) / 1000),
        );
        const quote = await manager.getRepository(FareQuote).findOne({
          where: { id: ride.fareQuoteId },
          lock: { mode: 'pessimistic_read' },
        });

        if (!quote) {
          throw new ConflictException('No existe la cotización del viaje');
        }

        const calculation = this.calculateFinalFare(
          ride,
          trackedDistanceMeters,
          actualDurationSeconds,
        );
        const finalFareRepository = manager.getRepository(RideFinalFare);
        const finalFare = await finalFareRepository.save(
          finalFareRepository.create({
            rideId: ride.id,
            fareRuleId: quote.fareRuleId,
            trackedDistanceMeters,
            actualDurationSeconds,
            ...calculation,
          }),
        );

        const previousStatus = ride.status;
        ride.completedAt = now;
        ride.actualDistanceMeters = trackedDistanceMeters;
        ride.actualDurationSeconds = actualDurationSeconds;
        ride.destinationArrivalDistanceMeters = destinationDistance.toFixed(2);
        ride.calculatedFinalFare = calculation.calculatedFinalFare;
        ride.finalFare = calculation.finalFare;
        ride.fareWasCapped = calculation.fareWasCapped;
        ride.completionNotes = dto.completionNotes?.trim() || null;

        await this.transitionsService.transitionWithinTransaction(
          manager,
          ride,
          RideStatus.COMPLETED,
          {
            actorType: RideStatusActor.DRIVER,
            actorUserId: driverUserId,
            occurredAt: now,
            metadata: {
              actualDistanceMeters: trackedDistanceMeters,
              actualDurationSeconds,
              destinationArrivalDistanceMeters: destinationDistance.toFixed(2),
              finalFare: calculation.finalFare,
              fareWasCapped: calculation.fareWasCapped,
            },
          },
        );

        state.status = DriverOperationalStatus.AVAILABLE;
        state.lastSeenAt = now;
        state.disconnectedAt = null;
        await manager.getRepository(DriverOperationalState).save(state);
        metrics.calculatedDurationSeconds = actualDurationSeconds;
        await manager.getRepository(RideProgressMetrics).save(metrics);

        return { ride, previousStatus, finalFare, location: location };
      },
    );

    await this.restoreAvailability(
      outcome.ride.driverProfileId!,
      outcome.location,
    );
    this.emitCompletedSafely(outcome);

    return {
      rideId: outcome.ride.id,
      status: outcome.ride.status,
      stateVersion: outcome.ride.stateVersion,
      completedAt: outcome.ride.completedAt!,
      actualDistanceMeters: outcome.ride.actualDistanceMeters!,
      actualDurationSeconds: outcome.ride.actualDurationSeconds!,
      estimatedFare: outcome.ride.estimatedFare,
      finalFare: outcome.finalFare.finalFare,
      currency: outcome.finalFare.currency,
      fareWasCapped: outcome.finalFare.fareWasCapped,
    };
  }

  private calculateFinalFare(
    ride: Ride,
    distanceMeters: number,
    durationSeconds: number,
  ): FareCalculation {
    const required = [
      ride.pricingBaseFare,
      ride.pricingMinimumFare,
      ride.pricingPricePerKm,
      ride.pricingPricePerMinute,
      ride.pricingBookingFee,
      ride.pricingAdjustmentMultiplier,
      ride.pricingCurrency,
      ride.pricingCalculationVersion,
    ];

    if (required.some((value) => value === null)) {
      throw new ConflictException(
        'El viaje no contiene un snapshot tarifario; crea un viaje nuevo',
      );
    }

    const base = parseScaledDecimal(ride.pricingBaseFare!, 2);
    const minimum = parseScaledDecimal(ride.pricingMinimumFare!, 2);
    const booking = parseScaledDecimal(ride.pricingBookingFee!, 2);
    const distance = calculateDistanceAmountCents(
      ride.pricingPricePerKm!,
      distanceMeters,
    );
    const time = calculateTimeAmountCents(
      ride.pricingPricePerMinute!,
      durationSeconds,
    );
    const subtotal = base + distance + time + booking;
    const multiplier = parseScaledDecimal(ride.pricingAdjustmentMultiplier!, 3);
    const adjusted = applyMultiplierToCents(subtotal, multiplier);
    const calculated = adjusted > minimum ? adjusted : minimum;
    const estimated = parseScaledDecimal(ride.estimatedFare, 2);
    const cap = divideRoundHalfUp(
      estimated * BigInt(100 + this.maxIncreasePercent),
      100n,
    );
    const final = calculated > cap ? cap : calculated;

    return {
      baseFare: formatCents(base),
      distanceAmount: formatCents(distance),
      timeAmount: formatCents(time),
      bookingFee: formatCents(booking),
      subtotal: formatCents(subtotal),
      adjustmentMultiplier: ride.pricingAdjustmentMultiplier!,
      calculatedFinalFare: formatCents(calculated),
      finalFare: formatCents(final),
      fareCapAmount: formatCents(cap),
      fareWasCapped: calculated > cap,
      currency: ride.pricingCurrency!,
      calculationVersion: ride.pricingCalculationVersion!,
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

    if (!profile) throw new NotFoundException('El perfil no existe');
    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado');
    }
    return profile;
  }

  private assertUsableLocation(
    location: DriverLocation | null,
    now: Date,
  ): asserts location is DriverLocation {
    if (!location) {
      throw new BadRequestException(
        'Debes registrar una ubicación antes de finalizar el viaje',
      );
    }
    if (now.getTime() - location.recordedAt.getTime() > LOCATION_MAX_AGE_MS) {
      throw new BadRequestException(
        'La ubicación GPS está vencida; actualízala antes de finalizar',
      );
    }
    if (
      location.accuracy === null ||
      location.accuracy > LOCATION_MAX_ACCURACY_METERS
    ) {
      throw new BadRequestException(
        'La precisión GPS no es suficiente para finalizar el viaje',
      );
    }
  }

  private async distanceToDestination(
    manager: EntityManager,
    rideId: string,
    driverProfileId: string,
  ): Promise<number> {
    const result: unknown = await manager.query(
      `SELECT ST_Distance(location.position, ride.destination_position) AS "distanceMeters"
       FROM driver_locations location
       INNER JOIN rides ride ON ride.id = $1
       WHERE location.driver_profile_id = $2
       LIMIT 1`,
      [rideId, driverProfileId],
    );
    const rows = result as DistanceRow[];
    const value = Number(rows[0]?.distanceMeters);
    if (!Number.isFinite(value)) {
      throw new BadRequestException(
        'No fue posible calcular la distancia al destino',
      );
    }
    return value;
  }

  private async restoreAvailability(
    driverProfileId: string,
    location: DriverLocation,
  ): Promise<void> {
    try {
      const [profile, vehicle, documents] = await Promise.all([
        this.dataSource.getRepository(DriverProfile).findOne({
          where: { id: driverProfileId },
        }),
        this.dataSource.getRepository(DriverVehicle).findOne({
          where: { driverProfileId },
        }),
        this.dataSource.getRepository(DriverDocument).find({
          where: { driverProfileId },
        }),
      ]);
      const byType = new Map(documents.map((item) => [item.type, item]));
      const license = byType.get(DriverDocumentType.DRIVER_LICENSE);
      const soat = byType.get(DriverDocumentType.SOAT);
      const today = new Date().toISOString().slice(0, 10);
      const eligible =
        profile?.status === DriverStatus.APPROVED &&
        vehicle?.status === VehicleStatus.APPROVED &&
        license?.status === DriverDocumentStatus.APPROVED &&
        soat?.status === DriverDocumentStatus.APPROVED &&
        Boolean(license.expiresAt && license.expiresAt >= today) &&
        Boolean(soat.expiresAt && soat.expiresAt >= today);

      if (eligible) {
        await this.availabilityRedisService.publishAvailableDriver(
          driverProfileId,
          location.longitude,
          location.latitude,
        );
      } else {
        await this.availabilityRedisService.removeDriverAvailability(
          driverProfileId,
        );
      }
    } catch (error: unknown) {
      this.logger.warn(
        `El viaje finalizó, pero Redis no pudo actualizarse: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }

  private emitCompletedSafely(outcome: CompletionOutcome): void {
    try {
      this.realtimeService.emitStatusChanged(
        outcome.ride,
        outcome.previousStatus,
      );
      this.realtimeService.emitCompleted(outcome.ride, outcome.finalFare);
    } catch (error: unknown) {
      this.logger.warn(
        `El viaje ${outcome.ride.id} finalizó, pero el evento no pudo emitirse: ${
          error instanceof Error ? error.message : 'error desconocido'
        }`,
      );
    }
  }
}
