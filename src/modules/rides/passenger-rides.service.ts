import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DataSource,
  In,
  IsNull,
  LessThanOrEqual,
  MoreThan,
  QueryFailedError,
} from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { CommissionPolicyService } from '../commissions/commission-policy.service';
import type { CommissionPolicySnapshot } from '../commissions/interfaces/commission-policy-snapshot.interface';
import { FareQuote } from '../fares/entities/fare-quote.entity';
import { FareQuoteStatus } from '../fares/enums/fare-quote-status.enum';
import { FareRule } from '../fares/entities/fare-rule.entity';
import { FareRuleStatus } from '../fares/enums/fare-rule-status.enum';
import { ServiceZone } from '../service-zones/entities/service-zone.entity';
import { ServiceZoneStatus } from '../service-zones/enums/service-zone-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { PromotionsService } from '../promotions/promotions.service';
import { CancelPassengerRideDto } from './dto/cancel-passenger-ride.dto';
import { PaymentMethod } from '../payments/enums/payment-method.enum';
import { CreatePassengerRideDto } from './dto/create-passenger-ride.dto';
import { PassengerRideResponseDto } from './dto/passenger-ride-response.dto';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatusActor } from './enums/ride-status-actor.enum';
import { RideStatus } from './enums/ride-status.enum';
import { RideStatusHistory } from './entities/ride-status-history.entity';
import { RideDispatchService } from './ride-dispatch.service';
import { CancellationPolicyService } from './cancellation-policy.service';
import type { CancellationPolicySnapshot } from './interfaces/cancellation-policy-snapshot.interface';
import { RideTransitionsService } from './ride-transitions.service';
import { RideViewService } from './ride-view.service';

const RIDE_SEARCH_TTL_MS = 2 * 60 * 1000;

export const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.SEARCHING_DRIVER,
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

interface ExpiredQuoteOutcome {
  quoteExpired: true;
}

@Injectable()
export class PassengerRidesService {
  private readonly logger = new Logger(PassengerRidesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly rideDispatchService: RideDispatchService,
    private readonly transitionsService: RideTransitionsService,
    private readonly rideViewService: RideViewService,
    @Optional() private readonly outboxService?: OutboxService,
    @Optional()
    private readonly cancellationPolicyService?: CancellationPolicyService,
    @Optional()
    private readonly commissionPolicyService?: CommissionPolicyService,
    @Optional()
    private readonly promotionsService?: PromotionsService,
  ) {}

  async createRide(
    passengerUserId: string,
    dto: CreatePassengerRideDto,
  ): Promise<PassengerRideResponseDto> {
    try {
      const outcome = await this.dataSource.transaction(
        async (manager): Promise<Ride | ExpiredQuoteOutcome> => {
          const passenger = await this.lockPassenger(manager, passengerUserId);

          this.assertPassengerEnabled(passenger);

          const quoteRepository = manager.getRepository(FareQuote);
          const quote = await this.lockFareQuote(
            quoteRepository,
            dto.fareQuoteId,
          );

          this.assertQuoteBelongsToPassenger(quote, passengerUserId);

          if (quote.status !== FareQuoteStatus.ACTIVE) {
            throw new BadRequestException(
              'La cotización ya no se encuentra disponible',
            );
          }

          const now = new Date();

          if (quote.expiresAt.getTime() <= now.getTime()) {
            quote.status = FareQuoteStatus.EXPIRED;
            await quoteRepository.save(quote);

            return {
              quoteExpired: true,
            };
          }

          await this.assertQuoteReferencesRemainActive(manager, quote, now);

          const rideRepository = manager.getRepository(Ride);
          const activeRide = await rideRepository.findOne({
            where: {
              passengerUserId,
              status: In([...ACTIVE_RIDE_STATUSES]),
            },
            lock: {
              mode: 'pessimistic_write',
            },
          });

          if (activeRide) {
            const isExpiredSearch =
              activeRide.status === RideStatus.SEARCHING_DRIVER &&
              activeRide.searchExpiresAt.getTime() <= now.getTime();

            if (isExpiredSearch) {
              await this.transitionsService.expireWithinTransaction(
                manager,
                activeRide,
                now,
              );
              await manager.getRepository(RideOffer).update(
                {
                  rideId: activeRide.id,
                  status: RideOfferStatus.OFFERED,
                },
                {
                  status: RideOfferStatus.EXPIRED,
                  respondedAt: now,
                },
              );
            } else {
              throw new ConflictException(
                'El pasajero ya tiene un viaje activo',
              );
            }
          }

          const cancellationPolicy = this.cancellationPolicyService
            ? await this.cancellationPolicyService.getActiveSnapshot(
                manager,
                now,
              )
            : this.fallbackCancellationPolicy();

          const commissionPolicy = this.commissionPolicyService
            ? await this.commissionPolicyService.getActiveSnapshot(manager, now)
            : this.fallbackCommissionPolicy();

          const ride = rideRepository.create({
            passengerUserId,
            driverProfileId: null,
            fareQuoteId: quote.id,
            originZoneId: quote.originZoneId,
            destinationZoneId: quote.destinationZoneId,
            originPosition: quote.originPosition,
            destinationPosition: quote.destinationPosition,
            originAddress: quote.originAddress,
            destinationAddress: quote.destinationAddress,
            distanceMeters: quote.distanceMeters,
            estimatedDurationSeconds: quote.durationSeconds,
            promotionCode: null,
            estimatedDiscount: '0.00',
            estimatedPassengerFare: quote.estimatedFare,
            finalDiscount: null,
            passengerAmountDue: null,
            estimatedFare: quote.estimatedFare,
            finalFare: null,
            pricingBaseFare: quote.baseFare,
            pricingMinimumFare: quote.pricingMinimumFare,
            pricingPricePerKm: quote.pricingPricePerKm,
            pricingPricePerMinute: quote.pricingPricePerMinute,
            pricingBookingFee: quote.bookingFee,
            pricingAdjustmentMultiplier: quote.adjustmentMultiplier,
            pricingCurrency: quote.currency,
            pricingCalculationVersion: quote.pricingCalculationVersion,
            currency: quote.currency,
            paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
            commissionPolicyId: commissionPolicy.policyId,
            platformCommissionRateBps: commissionPolicy.rateBps,
            status: RideStatus.SEARCHING_DRIVER,
            passengerNotes: dto.passengerNotes?.trim() || null,
            requestedAt: now,
            searchExpiresAt: new Date(now.getTime() + RIDE_SEARCH_TTL_MS),
            dispatchRound: 0,
            lastDispatchAt: null,
            driverAssignedAt: null,
            driverArrivingAt: null,
            driverArrivedAt: null,
            arrivalDistanceMeters: null,
            stateVersion: 0,
            startedAt: null,
            completedAt: null,
            actualDistanceMeters: null,
            actualDurationSeconds: null,
            destinationArrivalDistanceMeters: null,
            calculatedFinalFare: null,
            fareWasCapped: null,
            completionNotes: null,
            cancellationPolicyId: cancellationPolicy.policyId,
            cancellationGracePeriodSeconds:
              cancellationPolicy.gracePeriodSeconds,
            cancellationAssignedFee: cancellationPolicy.assignedFee,
            cancellationArrivingFee: cancellationPolicy.arrivingFee,
            cancellationArrivedFee: cancellationPolicy.arrivedFee,
            passengerNoShowFee: cancellationPolicy.passengerNoShowFee,
            driverNoShowCompensation:
              cancellationPolicy.driverNoShowCompensation,
            driverArrivalWaitSeconds:
              cancellationPolicy.driverArrivalWaitSeconds,
            driverNoProgressSeconds: cancellationPolicy.driverNoProgressSeconds,
            driverNoProgressMinMeters:
              cancellationPolicy.driverNoProgressMinMeters,
            cancelledAt: null,
            cancellationReason: null,
            cancelledBy: null,
          });
          const savedRide = await rideRepository.save(ride);

          if (dto.couponCode) {
            const reserved =
              await this.promotionsService?.reserveWithinTransaction(
                manager,
                passengerUserId,
                savedRide.id,
                dto.couponCode,
                quote.estimatedFare,
                quote.currency,
                now,
              );
            if (!reserved)
              throw new ConflictException('Promociones no disponibles');
            savedRide.promotionCode = reserved.code;
            savedRide.estimatedDiscount = reserved.discountAmount;
            savedRide.estimatedPassengerFare = reserved.passengerAmountDue;
            await rideRepository.save(savedRide);
          }

          const initialHistory = manager
            .getRepository(RideStatusHistory)
            .create({
              rideId: savedRide.id,
              previousStatus: null,
              newStatus: RideStatus.SEARCHING_DRIVER,
              actorType: RideStatusActor.PASSENGER,
              actorUserId: passengerUserId,
              metadata: { fareQuoteId: quote.id },
              occurredAt: now,
            });
          await manager.getRepository(RideStatusHistory).save(initialHistory);

          if (this.outboxService) {
            await this.outboxService.enqueueWithinTransaction(manager, {
              aggregateType: 'RIDE',
              aggregateId: savedRide.id,
              eventType: OutboxEventType.RIDE_REQUESTED,
              payload: {
                passengerUserId,
                status: RideStatus.SEARCHING_DRIVER,
                stateVersion: savedRide.stateVersion,
                requestedAt: now.toISOString(),
              },
            });
          }

          quote.status = FareQuoteStatus.USED;
          quote.usedAt = now;
          await quoteRepository.save(quote);

          return savedRide;
        },
      );

      if ('quoteExpired' in outcome) {
        throw new BadRequestException(
          'La cotización ha vencido; genera una nueva cotización',
        );
      }

      await this.rideDispatchService
        .dispatchRide(outcome.id)
        .catch((error: unknown) => {
          this.logger.warn(
            `No pudo iniciarse el matching del viaje ${outcome.id}: ${this.errorMessage(error)}`,
          );
        });

      return this.rideViewService.toPassengerResponse(outcome);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'El pasajero ya tiene un viaje activo o la cotización ya fue utilizada',
        );
      }

      throw error;
    }
  }

  async getActiveRide(
    passengerUserId: string,
  ): Promise<PassengerRideResponseDto> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        passengerUserId,
        status: In([...ACTIVE_RIDE_STATUSES]),
      },
      order: {
        requestedAt: 'DESC',
      },
    });

    if (!ride) {
      throw new NotFoundException('El pasajero no tiene un viaje activo');
    }

    if (
      ride.status === RideStatus.SEARCHING_DRIVER &&
      ride.searchExpiresAt.getTime() <= Date.now()
    ) {
      await this.expireSearchingRide(ride.id);

      throw new NotFoundException('El pasajero no tiene un viaje activo');
    }

    if (ride.status === RideStatus.SEARCHING_DRIVER) {
      await this.rideDispatchService
        .dispatchRide(ride.id)
        .catch((error: unknown) => {
          this.logger.warn(
            `No pudo continuarse el matching del viaje ${ride.id}: ` +
              this.errorMessage(error),
          );
        });
    }

    return this.rideViewService.toPassengerResponse(ride);
  }

  async getRide(
    passengerUserId: string,
    rideId: string,
  ): Promise<PassengerRideResponseDto> {
    const ride = await this.dataSource.getRepository(Ride).findOne({
      where: {
        id: rideId,
        passengerUserId,
      },
    });

    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }

    return this.rideViewService.toPassengerResponse(ride);
  }

  async cancelRide(
    passengerUserId: string,
    rideId: string,
    dto: CancelPassengerRideDto,
  ): Promise<PassengerRideResponseDto> {
    const ride = await this.transitionsService.cancelByPassenger(
      passengerUserId,
      rideId,
      dto.reason,
    );

    return this.rideViewService.toPassengerResponse(ride);
  }

  expireSearchingRide(rideId: string): Promise<boolean> {
    return this.transitionsService.expireSearchingRide(rideId);
  }

  private async lockPassenger(
    manager: EntityManager,
    passengerUserId: string,
  ): Promise<User> {
    const passenger = await manager.getRepository(User).findOne({
      where: {
        id: passengerUserId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!passenger) {
      throw new NotFoundException('El pasajero no existe');
    }

    return passenger;
  }

  private assertPassengerEnabled(passenger: User): void {
    if (
      passenger.status !== UserStatus.ACTIVE ||
      !passenger.isPhoneVerified ||
      !passenger.roles.includes(UserRole.PASSENGER)
    ) {
      throw new ForbiddenException('La cuenta del pasajero no está habilitada');
    }
  }

  private async lockFareQuote(
    repository: Repository<FareQuote>,
    fareQuoteId: string,
  ): Promise<FareQuote> {
    const quote = await repository.findOne({
      where: {
        id: fareQuoteId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!quote) {
      throw new NotFoundException('La cotización no existe');
    }

    return quote;
  }

  private assertQuoteBelongsToPassenger(
    quote: FareQuote,
    passengerUserId: string,
  ): void {
    if (quote.passengerUserId !== passengerUserId) {
      throw new NotFoundException('La cotización no existe');
    }
  }

  private async assertQuoteReferencesRemainActive(
    manager: EntityManager,
    quote: FareQuote,
    now: Date,
  ): Promise<void> {
    const zoneRepository = manager.getRepository(ServiceZone);
    const [originZone, destinationZone] = await Promise.all([
      zoneRepository.findOne({
        where: {
          id: quote.originZoneId,
          status: ServiceZoneStatus.ACTIVE,
        },
        lock: {
          mode: 'pessimistic_read',
        },
      }),
      zoneRepository.findOne({
        where: {
          id: quote.destinationZoneId,
          status: ServiceZoneStatus.ACTIVE,
        },
        lock: {
          mode: 'pessimistic_read',
        },
      }),
    ]);

    if (!originZone || !destinationZone) {
      throw new BadRequestException(
        'La cobertura de la cotización ya no está disponible',
      );
    }

    const fareRule = await manager.getRepository(FareRule).findOne({
      where: [
        {
          id: quote.fareRuleId,
          status: FareRuleStatus.ACTIVE,
          effectiveFrom: LessThanOrEqual(now),
          effectiveUntil: IsNull(),
        },
        {
          id: quote.fareRuleId,
          status: FareRuleStatus.ACTIVE,
          effectiveFrom: LessThanOrEqual(now),
          effectiveUntil: MoreThan(now),
        },
      ],
      lock: {
        mode: 'pessimistic_read',
      },
    });

    if (!fareRule) {
      throw new BadRequestException(
        'La regla tarifaria de la cotización ya no está disponible',
      );
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }

  private fallbackCancellationPolicy(): CancellationPolicySnapshot {
    return {
      policyId: null,
      gracePeriodSeconds: 60,
      assignedFee: '1.00',
      arrivingFee: '1.50',
      arrivedFee: '2.00',
      passengerNoShowFee: '2.50',
      driverNoShowCompensation: '1.50',
      driverArrivalWaitSeconds: 300,
      driverNoProgressSeconds: 180,
      driverNoProgressMinMeters: 100,
      currency: 'PEN',
    };
  }

  private fallbackCommissionPolicy(): CommissionPolicySnapshot {
    return {
      policyId: null,
      rateBps: 500,
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const queryError = error as QueryFailedError & {
      driverError?: {
        code?: string;
      };
    };

    return queryError.driverError?.code === '23505';
  }
}
