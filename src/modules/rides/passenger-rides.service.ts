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
  Not,
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
import { parseScaledDecimal } from '../fares/utils/fixed-decimal.util';
import { PassengerRideOfferResponseDto } from './dto/passenger-ride-offer-response.dto';
import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import {
  ACTIVE_DRIVER_RIDE_STATUSES,
  calculateRideSearchExpiresAt,
} from './ride-matching.constants';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { deriveLastNameInitial } from './utils/last-name-initial.util';

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
    @Optional()
    private readonly availabilityRedisService?: DriverAvailabilityRedisService,
    @Optional()
    private readonly realtimeService?: RideRealtimeService,
    @Optional() private readonly avatarResolver?: AvatarUrlResolverService,
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

          /*
           * Mientras las aplicaciones antiguas no envíen
           * passengerOfferFare, usamos estimatedFare.
           *
           * De esta manera el cambio es retrocompatible.
           */
          const passengerOfferFare = this.normalizePassengerOfferFare(
            dto.passengerOfferFare ?? quote.estimatedFare,
          );

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
                  status: In([
                    RideOfferStatus.OFFERED,
                    RideOfferStatus.PROPOSED,
                  ]),
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

            passengerOfferFare: passengerOfferFare,

            /*
             * Todavía no existe precio acordado
             * porque ningún conductor ha sido
             * elegido por el pasajero.
             */
            agreedFare: null,

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
            searchExpiresAt: calculateRideSearchExpiresAt(now),
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

  async getRideOffers(
    passengerUserId: string,
    rideId: string,
  ): Promise<PassengerRideOfferResponseDto[]> {
    const rideRepository = this.dataSource.getRepository(Ride);

    /*
     * Primero comprobamos que el viaje
     * realmente pertenece al pasajero.
     */
    const ride = await rideRepository.findOne({
      where: {
        id: rideId,
        passengerUserId,
      },
    });

    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }

    const now = new Date();

    /*
     * Si el tiempo global de búsqueda terminó,
     * dejamos que la máquina central expire
     * correctamente el viaje y sus propuestas.
     */
    if (
      ride.status === RideStatus.SEARCHING_DRIVER &&
      ride.searchExpiresAt.getTime() <= now.getTime()
    ) {
      await this.expireSearchingRide(ride.id);

      return [];
    }

    /*
     * Las propuestas solo tienen sentido
     * mientras Passenger todavía está
     * eligiendo conductor.
     */
    if (ride.status !== RideStatus.SEARCHING_DRIVER) {
      throw new ConflictException(
        'El viaje ya no se encuentra recibiendo propuestas',
      );
    }

    const offerRepository = this.dataSource.getRepository(RideOffer);

    /*
     * Limpiamos primero cualquier propuesta
     * que haya vencido.
     */
    await offerRepository.update(
      {
        rideId: ride.id,
        status: RideOfferStatus.PROPOSED,
        expiresAt: LessThanOrEqual(now),
      },
      {
        status: RideOfferStatus.EXPIRED,
        respondedAt: now,
      },
    );

    /*
     * Passenger solamente debe ver
     * propuestas vigentes.
     *
     * Nunca mostramos:
     * OFFERED
     * REJECTED
     * EXPIRED
     * CANCELLED
     */
    const offers = await offerRepository.find({
      where: {
        rideId: ride.id,
        status: RideOfferStatus.PROPOSED,
        expiresAt: MoreThan(now),
      },
      relations: {
        driverProfile: true,
      },
      order: {
        proposedFare: 'ASC',
        distanceToOriginMeters: 'ASC',
        proposedAt: 'ASC',
      },
    });

    const passengerOfferFare = ride.passengerOfferFare ?? ride.estimatedFare;

    const passengerOfferCents = parseScaledDecimal(passengerOfferFare, 2);

    return offers.map((offer) => {
      /*
       * Una fila PROPOSED creada por nuestro
       * flujo siempre debe tener precio,
       * fecha y perfil.
       */
      if (!offer.proposedFare || !offer.proposedAt || !offer.driverProfile) {
        throw new ConflictException(
          'Existe una propuesta de conductor incompleta',
        );
      }

      const proposedCents = parseScaledDecimal(offer.proposedFare, 2);

      const lastNameInitial = deriveLastNameInitial(
        offer.driverProfile.lastName,
      );

      return {
        offerId: offer.id,

        rideId: ride.id,

        driver: {
          profileId: offer.driverProfile.id,

          firstName: offer.driverProfile.firstName,

          lastNameInitial,

          photoUrl:
            this.avatarResolver?.resolveDriverAvatarUrl(offer.driverProfile) ??
            offer.driverProfile.photoUrl,

          ratingAverage: offer.driverProfile.ratingAverage,

          ratingCount: offer.driverProfile.ratingCount,
        },

        distanceToOriginMeters: offer.distanceToOriginMeters,

        passengerOfferFare,

        proposedFare: offer.proposedFare,

        isCounterOffer: proposedCents !== passengerOfferCents,

        currency: ride.currency,

        proposedAt: offer.proposedAt,

        expiresAt: offer.expiresAt,
      };
    });
  }

  async selectRideOffer(
    passengerUserId: string,
    rideId: string,
    offerId: string,
  ): Promise<PassengerRideResponseDto> {
    type SelectionOutcome =
      | {
          kind: 'selected';
          ride: Ride;
          driverProfileId: string;
        }
      | {
          kind: 'ride-expired';
        }
      | {
          kind: 'offer-expired';
        };

    try {
      const outcome = await this.dataSource.transaction(
        async (manager): Promise<SelectionOutcome> => {
          const rideRepository = manager.getRepository(Ride);

          /*
           * El bloqueo del Ride es la defensa principal
           * contra doble selección.
           *
           * Dos peticiones simultáneas no pueden asignar
           * dos conductores al mismo viaje.
           */
          const ride = await rideRepository.findOne({
            where: {
              id: rideId,
            },
            lock: {
              mode: 'pessimistic_write',
            },
          });

          if (!ride || ride.passengerUserId !== passengerUserId) {
            throw new NotFoundException('El viaje no existe');
          }

          const now = new Date();

          if (ride.status !== RideStatus.SEARCHING_DRIVER) {
            throw new ConflictException(
              'El viaje ya tiene conductor o dejó de recibir propuestas',
            );
          }

          /*
           * Si la búsqueda global venció,
           * persistimos correctamente EXPIRED
           * antes de responder el conflicto.
           */
          if (ride.searchExpiresAt.getTime() <= now.getTime()) {
            await this.transitionsService.expireWithinTransaction(
              manager,
              ride,
              now,
            );

            await manager.getRepository(RideOffer).update(
              {
                rideId: ride.id,
                status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
              },
              {
                status: RideOfferStatus.EXPIRED,
                respondedAt: now,
              },
            );

            return {
              kind: 'ride-expired',
            };
          }

          const offerRepository = manager.getRepository(RideOffer);

          /*
           * También bloqueamos la propuesta
           * concreta seleccionada.
           */
          const offer = await offerRepository.findOne({
            where: {
              id: offerId,
              rideId: ride.id,
            },
            lock: {
              mode: 'pessimistic_write',
            },
          });

          if (!offer) {
            throw new NotFoundException('La propuesta no existe');
          }

          if (offer.status !== RideOfferStatus.PROPOSED) {
            throw new ConflictException(
              'La propuesta ya no se encuentra disponible',
            );
          }

          if (!offer.proposedFare || !offer.proposedAt) {
            throw new ConflictException('La propuesta está incompleta');
          }

          if (offer.expiresAt.getTime() <= now.getTime()) {
            offer.status = RideOfferStatus.EXPIRED;

            offer.respondedAt = offer.respondedAt ?? now;

            await offerRepository.save(offer);

            return {
              kind: 'offer-expired',
            };
          }

          /*
           * El conductor puede haber sido suspendido
           * entre el momento de ofertar y el momento
           * en que Passenger lo selecciona.
           */
          const driverProfile = await manager
            .getRepository(DriverProfile)
            .findOne({
              where: {
                id: offer.driverProfileId,
              },
              lock: {
                mode: 'pessimistic_read',
              },
            });

          if (
            !driverProfile ||
            driverProfile.status !== DriverStatus.APPROVED
          ) {
            throw new ConflictException(
              'El conductor ya no está disponible para operar',
            );
          }

          /*
           * Este bloqueo evita que el mismo conductor
           * gane dos viajes simultáneamente.
           */
          const operationalState = await manager
            .getRepository(DriverOperationalState)
            .findOne({
              where: {
                driverProfileId: driverProfile.id,
              },
              lock: {
                mode: 'pessimistic_write',
              },
            });

          if (
            !operationalState ||
            operationalState.status !== DriverOperationalStatus.AVAILABLE
          ) {
            throw new ConflictException(
              'El conductor ya no se encuentra disponible',
            );
          }

          /*
           * Segunda defensa contra doble asignación:
           * comprobamos viajes activos del conductor.
           */
          const driverActiveRide = await rideRepository.findOne({
            where: {
              driverProfileId: driverProfile.id,

              status: In([...ACTIVE_DRIVER_RIDE_STATUSES]),
            },
            lock: {
              mode: 'pessimistic_write',
            },
          });

          if (driverActiveRide) {
            throw new ConflictException(
              'El conductor ya tiene otro viaje activo',
            );
          }

          /*
           * Aquí se congela el precio negociado.
           *
           * A partir de este punto agreedFare
           * no debe volver a modificarse.
           */
          ride.agreedFare = offer.proposedFare;

          /*
           * La propuesta elegida pasa a ACCEPTED.
           */
          offer.status = RideOfferStatus.ACCEPTED;

          offer.acceptedAt = now;

          offer.cancelledAt = null;

          offer.rejectedAt = null;

          offer.rejectionReason = null;

          await offerRepository.save(offer);

          /*
           * El conductor recién ahora queda BUSY.
           */
          operationalState.status = DriverOperationalStatus.BUSY;

          operationalState.lastSeenAt = now;

          operationalState.disconnectedAt = null;

          await manager
            .getRepository(DriverOperationalState)
            .save(operationalState);

          /*
           * Ahora sí:
           *
           * SEARCHING_DRIVER
           *       ↓
           * DRIVER_ASSIGNED
           *
           * Actor: PASSENGER
           */
          await this.transitionsService.assignDriverSelectedByPassengerWithinTransaction(
            manager,
            ride,
            driverProfile.id,
            passengerUserId,
            offer.id,
            now,
          );

          /*
           * Cancelamos todas las demás invitaciones
           * y propuestas de ESTE viaje.
           */
          await offerRepository.update(
            {
              rideId: ride.id,

              id: Not(offer.id),

              status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
            },
            {
              status: RideOfferStatus.CANCELLED,

              respondedAt: now,

              cancelledAt: now,
            },
          );

          /*
           * Como el conductor ya está BUSY,
           * también cancelamos invitaciones/propuestas
           * que pudiera tener en OTROS viajes.
           */
          await offerRepository.update(
            {
              driverProfileId: driverProfile.id,

              id: Not(offer.id),

              status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
            },
            {
              status: RideOfferStatus.CANCELLED,

              respondedAt: now,

              cancelledAt: now,
            },
          );

          return {
            kind: 'selected',
            ride,
            driverProfileId: driverProfile.id,
          };
        },
      );

      if (outcome.kind === 'ride-expired') {
        throw new ConflictException('El tiempo para elegir conductor terminó');
      }

      if (outcome.kind === 'offer-expired') {
        throw new ConflictException('La propuesta seleccionada ya venció');
      }

      /*
       * PostgreSQL ya confirmó la asignación.
       * Redis es una proyección operativa, así que
       * un fallo aquí no debe revertir el viaje.
       */
      if (this.availabilityRedisService) {
        await this.availabilityRedisService
          .registerBusyPresence(outcome.driverProfileId)
          .catch((error: unknown) => {
            this.logger.warn(
              `El conductor ${outcome.driverProfileId} ` +
                'quedó BUSY en PostgreSQL, ' +
                'pero Redis no pudo actualizarse: ' +
                this.errorMessage(error),
            );
          });
      }

      /*
       * Igual que Redis, WebSocket ocurre después
       * del commit.
       */
      if (this.realtimeService) {
        try {
          this.realtimeService.emitAssigned(outcome.ride);

          this.realtimeService.emitStatusChanged(
            outcome.ride,
            RideStatus.SEARCHING_DRIVER,
          );
        } catch (error: unknown) {
          this.logger.warn(
            `El viaje ${outcome.ride.id} fue asignado, ` +
              'pero no pudo emitirse por WebSocket: ' +
              this.errorMessage(error),
          );
        }
      }

      return this.rideViewService.toPassengerResponse(outcome.ride);
    } catch (error: unknown) {
      /*
       * También conservamos las defensas únicas
       * de PostgreSQL como última línea contra
       * condiciones de carrera.
       */
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'El viaje o el conductor ya fueron asignados',
        );
      }

      throw error;
    }
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

  private normalizePassengerOfferFare(value: string): string {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0 || amount > 9999.99) {
      throw new BadRequestException(
        'El precio ofrecido por el pasajero no es válido',
      );
    }

    return amount.toFixed(2);
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
    /*
     * Fail-safe:
     *
     * Si por cualquier motivo el servicio
     * de políticas no está disponible,
     * nunca debemos cobrar accidentalmente.
     */
    return {
      policyId: null,
      rateBps: 0,
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
