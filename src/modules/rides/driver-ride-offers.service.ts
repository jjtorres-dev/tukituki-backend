import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, In, LessThanOrEqual, MoreThan } from 'typeorm';
import type { EntityManager } from 'typeorm';

import {
  formatCents,
  parseScaledDecimal,
} from '../fares/utils/fixed-decimal.util';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { CounterRideOfferDto } from './dto/counter-ride-offer.dto';
import { DriverPendingProposalResponseDto } from './dto/driver-pending-proposal-response.dto';
import { DriverRideOfferResponseDto } from './dto/driver-ride-offer-response.dto';
import { RejectRideOfferDto } from './dto/reject-ride-offer.dto';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { ACTIVE_DRIVER_RIDE_STATUSES } from './ride-matching.constants';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';

interface ProposedOutcome {
  kind: 'proposed';
  offer: RideOffer;
  rideId: string;
}

interface ExpiredOutcome {
  kind: 'expired';
}

interface UnavailableOutcome {
  kind: 'unavailable';
}

type ProposalOutcome = ProposedOutcome | ExpiredOutcome | UnavailableOutcome;

type RejectOutcome =
  | {
      kind: 'rejected';
      offer: RideOffer;
      rideId: string;
    }
  | ExpiredOutcome;

@Injectable()
export class DriverRideOffersService {
  private readonly logger = new Logger(DriverRideOffersService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly rideDispatchService: RideDispatchService,
    private readonly transitionsService: RideTransitionsService,
  ) {}

  async getActiveOffers(userId: string): Promise<DriverRideOfferResponseDto[]> {
    const profile = await this.getApprovedProfile(userId);

    await this.assertDriverIsAvailable(profile.id);

    const now = new Date();

    const repository = this.dataSource.getRepository(RideOffer);

    await this.expireStaleOffers(profile.id, now);

    /*
     * Al conductor solamente le devolvemos
     * como "activas" las solicitudes que
     * todavía puede responder.
     *
     * Una PROPOSED ya fue respondida.
     */
    const offers = await repository.find({
      where: {
        driverProfileId: profile.id,
        status: RideOfferStatus.OFFERED,
        expiresAt: MoreThan(now),
      },
      relations: {
        ride: true,
      },
      order: {
        distanceToOriginMeters: 'ASC',
        offeredAt: 'ASC',
      },
    });

    const firstNamesByPassengerUserId = await this.getPassengerFirstNames(
      offers.map((offer) => offer.ride.passengerUserId),
    );

    return offers.map((offer) =>
      this.mapOffer(offer, firstNamesByPassengerUserId),
    );
  }

  async getOffer(
    userId: string,
    offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    const profile = await this.getApprovedProfile(userId);

    const offer = await this.dataSource.getRepository(RideOffer).findOne({
      where: {
        id: offerId,
        driverProfileId: profile.id,
      },
      relations: {
        ride: true,
      },
    });

    if (!offer) {
      throw new NotFoundException('La oferta no existe');
    }

    const firstNamesByPassengerUserId = await this.getPassengerFirstNames([
      offer.ride.passengerUserId,
    ]);

    return this.mapOffer(offer, firstNamesByPassengerUserId);
  }

  /*
   * Batch lookup de firstName por passengerUserId: UNA sola query
   * para todas las Offers de la respuesta (nunca una query por
   * Offer, ni siquiera con 20-50 Offers simultáneas). No hay
   * relación TypeORM declarada entre Ride y PassengerProfile (ver
   * ride-view.service.ts para el mismo patrón ya usado
   * post-asignación), así que se resuelve con un IN explícito.
   */
  private async getPassengerFirstNames(
    passengerUserIds: string[],
  ): Promise<Map<string, string>> {
    const uniqueUserIds = [...new Set(passengerUserIds)];

    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const profiles = await this.dataSource
      .getRepository(PassengerProfile)
      .find({
        where: { userId: In(uniqueUserIds) },
        select: { userId: true, firstName: true },
      });

    return new Map(
      profiles.map((profile) => [profile.userId, profile.firstName]),
    );
  }

  /*
   * Recuperación autoritativa de propuestas PROPOSED
   * vigentes del conductor autenticado.
   *
   * Existe para que Flutter pueda reconstruir la
   * negociación tras un restart, cierre de app u otro
   * dispositivo, sin depender de _pendingOfferId local.
   *
   * Es independiente de "active": nunca devuelve OFFERED
   * y "active" nunca devuelve PROPOSED.
   */
  async getPendingProposals(
    userId: string,
  ): Promise<DriverPendingProposalResponseDto[]> {
    const profile = await this.getApprovedProfile(userId);

    const now = new Date();

    await this.expireStaleOffers(profile.id, now);

    const offers = await this.dataSource.getRepository(RideOffer).find({
      where: {
        driverProfileId: profile.id,
        status: RideOfferStatus.PROPOSED,
        expiresAt: MoreThan(now),
      },
      relations: {
        ride: true,
      },
      /*
       * La propuesta más próxima a expirar aparece
       * primero. Como desempate, la más antigua.
       */
      order: {
        expiresAt: 'ASC',
        createdAt: 'ASC',
      },
    });

    /*
     * Defensa adicional: una PROPOSED solo tiene sentido
     * si su viaje sigue en negociación activa. La misma
     * condición que ya usa proposeWithinTransaction.
     *
     * En la práctica siempre se cumple, porque cada
     * transición que saca al viaje de SEARCHING_DRIVER
     * también cierra sus ofertas OFFERED/PROPOSED.
     */
    const validOffers = offers.filter(
      (offer) =>
        offer.ride.status === RideStatus.SEARCHING_DRIVER &&
        offer.ride.searchExpiresAt.getTime() > now.getTime(),
    );

    return validOffers.map((offer) => this.mapPendingProposal(offer));
  }

  /*
   * El conductor acepta exactamente
   * el precio ofrecido por el pasajero.
   *
   * Esto genera PROPOSED.
   *
   * NO:
   * - asigna el viaje;
   * - pone al conductor BUSY;
   * - cancela otras ofertas.
   */
  async acceptOffer(
    userId: string,
    offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    const outcome = await this.dataSource.transaction((manager) =>
      this.proposeWithinTransaction(manager, userId, offerId, null),
    );

    this.assertProposalOutcome(outcome);

    const firstNamesByPassengerUserId = await this.getPassengerFirstNames([
      outcome.offer.ride.passengerUserId,
    ]);

    return this.mapOffer(outcome.offer, firstNamesByPassengerUserId);
  }

  /*
   * El conductor propone un precio válido.
   * Puede ser menor, igual o mayor que el
   * ofrecido inicialmente por el pasajero.
   */
  async counterOffer(
    userId: string,
    offerId: string,
    dto: CounterRideOfferDto,
  ): Promise<DriverRideOfferResponseDto> {
    const outcome = await this.dataSource.transaction((manager) =>
      this.proposeWithinTransaction(manager, userId, offerId, dto.proposedFare),
    );

    this.assertProposalOutcome(outcome);

    const firstNamesByPassengerUserId = await this.getPassengerFirstNames([
      outcome.offer.ride.passengerUserId,
    ]);

    return this.mapOffer(outcome.offer, firstNamesByPassengerUserId);
  }

  async rejectOffer(
    userId: string,
    offerId: string,
    dto: RejectRideOfferDto,
  ): Promise<DriverRideOfferResponseDto> {
    const outcome = await this.dataSource.transaction((manager) =>
      this.rejectWithinTransaction(manager, userId, offerId, dto),
    );

    if (outcome.kind === 'expired') {
      throw new ConflictException('La oferta ya venció');
    }

    await this.rideDispatchService
      .dispatchRide(outcome.rideId)
      .catch((error: unknown) => {
        this.logger.warn(
          `No pudo continuarse el matching del viaje ` +
            `${outcome.rideId}: ` +
            this.errorMessage(error),
        );
      });

    const firstNamesByPassengerUserId = await this.getPassengerFirstNames([
      outcome.offer.ride.passengerUserId,
    ]);

    return this.mapOffer(outcome.offer, firstNamesByPassengerUserId);
  }

  private async proposeWithinTransaction(
    manager: EntityManager,
    userId: string,
    offerId: string,
    counterOfferFare: string | null,
  ): Promise<ProposalOutcome> {
    const profile = await this.lockApprovedProfile(manager, userId);

    const offerRepository = manager.getRepository(RideOffer);

    /*
     * Primero obtenemos el rideId sin bloquear
     * todavía el viaje completo.
     */
    const offerSnapshot = await offerRepository.findOne({
      where: {
        id: offerId,
        driverProfileId: profile.id,
      },
    });

    if (!offerSnapshot) {
      throw new NotFoundException('La oferta no existe');
    }

    const rideRepository = manager.getRepository(Ride);

    /*
     * Bloqueamos el viaje para evitar carreras
     * con cancelación, expiración o futura
     * selección del pasajero.
     */
    const ride = await rideRepository.findOne({
      where: {
        id: offerSnapshot.rideId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }

    /*
     * Bloqueamos también esta RideOffer.
     */
    const offer = await offerRepository.findOne({
      where: {
        id: offerId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!offer || offer.driverProfileId !== profile.id) {
      throw new NotFoundException('La oferta no existe');
    }

    if (offer.status !== RideOfferStatus.OFFERED) {
      throw new ConflictException('La oferta ya fue respondida o cancelada');
    }

    const now = new Date();

    /*
     * La invitación original al conductor
     * pudo vencer antes de responder.
     */
    if (offer.expiresAt.getTime() <= now.getTime()) {
      offer.status = RideOfferStatus.EXPIRED;

      offer.respondedAt = now;

      await offerRepository.save(offer);

      return {
        kind: 'expired',
      };
    }

    /*
     * Si el viaje completo dejó de estar
     * disponible, tampoco permitimos presentar
     * propuestas.
     */
    if (
      ride.status !== RideStatus.SEARCHING_DRIVER ||
      ride.searchExpiresAt.getTime() <= now.getTime()
    ) {
      if (
        ride.status === RideStatus.SEARCHING_DRIVER &&
        ride.searchExpiresAt.getTime() <= now.getTime()
      ) {
        await this.transitionsService.expireWithinTransaction(
          manager,
          ride,
          now,
        );

        await offerRepository.update(
          {
            rideId: ride.id,
            status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
          },
          {
            status: RideOfferStatus.EXPIRED,
            respondedAt: now,
          },
        );
      } else {
        offer.status = RideOfferStatus.CANCELLED;

        offer.respondedAt = now;
        offer.cancelledAt = now;

        await offerRepository.save(offer);
      }

      return {
        kind: 'unavailable',
      };
    }

    /*
     * El conductor tiene que seguir AVAILABLE.
     *
     * Presentar una propuesta NO lo convierte
     * en BUSY.
     */
    const operationalState = await manager
      .getRepository(DriverOperationalState)
      .findOne({
        where: {
          driverProfileId: profile.id,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

    if (
      !operationalState ||
      operationalState.status !== DriverOperationalStatus.AVAILABLE
    ) {
      throw new ConflictException('El conductor ya no se encuentra disponible');
    }

    /*
     * Segunda defensa: un conductor con otro
     * viaje activo no puede ofertar.
     */
    const activeRide = await rideRepository.findOne({
      where: {
        driverProfileId: profile.id,
        status: In([...ACTIVE_DRIVER_RIDE_STATUSES]),
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (activeRide) {
      throw new ConflictException('El conductor ya tiene un viaje activo');
    }

    /*
     * Para viajes nuevos passengerOfferFare
     * siempre existe.
     *
     * El fallback mantiene compatibilidad con
     * registros históricos.
     */
    const passengerOfferFare = this.normalizeFare(
      ride.passengerOfferFare ?? ride.estimatedFare,
    );

    let proposedFare = passengerOfferFare;

    /*
     * Si viene monto explícito, estamos ante
     * una contraoferta.
     */
    if (counterOfferFare !== null) {
      proposedFare = this.normalizeFare(counterOfferFare);
    }

    offer.status = RideOfferStatus.PROPOSED;

    offer.proposedFare = proposedFare;

    offer.proposedAt = now;

    offer.respondedAt = now;

    /*
     * La invitación original podía durar
     * solamente unos segundos.
     *
     * Una vez propuesta, la dejamos vigente
     * hasta el final del período global
     * de búsqueda del viaje.
     */
    offer.expiresAt = ride.searchExpiresAt;

    offer.acceptedAt = null;

    offer.rejectedAt = null;

    offer.cancelledAt = null;

    offer.rejectionReason = null;

    const savedOffer = await offerRepository.save(offer);

    savedOffer.ride = ride;

    return {
      kind: 'proposed',
      offer: savedOffer,
      rideId: ride.id,
    };
  }

  private assertProposalOutcome(
    outcome: ProposalOutcome,
  ): asserts outcome is ProposedOutcome {
    if (outcome.kind === 'expired') {
      throw new ConflictException('La oferta ya venció');
    }

    if (outcome.kind === 'unavailable') {
      throw new ConflictException(
        'El viaje ya no está disponible para recibir propuestas',
      );
    }
  }

  private async rejectWithinTransaction(
    manager: EntityManager,
    userId: string,
    offerId: string,
    dto: RejectRideOfferDto,
  ): Promise<RejectOutcome> {
    const profile = await this.lockApprovedProfile(manager, userId);

    const operationalState = await manager
      .getRepository(DriverOperationalState)
      .findOne({
        where: {
          driverProfileId: profile.id,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

    if (
      !operationalState ||
      operationalState.status !== DriverOperationalStatus.AVAILABLE
    ) {
      throw new ForbiddenException(
        'El conductor debe estar AVAILABLE ' + 'para responder ofertas',
      );
    }

    const repository = manager.getRepository(RideOffer);

    const offer = await repository.findOne({
      where: {
        id: offerId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!offer || offer.driverProfileId !== profile.id) {
      throw new NotFoundException('La oferta no existe');
    }

    if (offer.status !== RideOfferStatus.OFFERED) {
      throw new ConflictException('La oferta ya fue respondida o cancelada');
    }

    const now = new Date();

    if (offer.expiresAt.getTime() <= now.getTime()) {
      offer.status = RideOfferStatus.EXPIRED;

      offer.respondedAt = now;

      await repository.save(offer);

      return {
        kind: 'expired',
      };
    }

    offer.status = RideOfferStatus.REJECTED;

    offer.respondedAt = now;

    offer.rejectedAt = now;

    offer.rejectionReason = dto.reason?.trim() || null;

    const savedOffer = await repository.save(offer);

    const ride = await manager.getRepository(Ride).findOne({
      where: {
        id: offer.rideId,
      },
    });

    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }

    savedOffer.ride = ride;

    return {
      kind: 'rejected',
      offer: savedOffer,
      rideId: offer.rideId,
    };
  }

  private async getApprovedProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.dataSource.getRepository(DriverProfile).findOne({
      where: {
        userId,
      },
    });

    if (!profile) {
      throw new NotFoundException('El perfil de conductor no existe');
    }

    if (profile.status !== DriverStatus.APPROVED) {
      throw new ForbiddenException('El conductor no está aprobado para operar');
    }

    return profile;
  }

  private async lockApprovedProfile(
    manager: EntityManager,
    userId: string,
  ): Promise<DriverProfile> {
    const profile = await manager
      .getRepository(DriverProfile)
      .createQueryBuilder('profile')
      .where('profile.user_id = :userId', {
        userId,
      })
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

  private async assertDriverIsAvailable(
    driverProfileId: string,
  ): Promise<void> {
    const state = await this.dataSource
      .getRepository(DriverOperationalState)
      .findOne({
        where: {
          driverProfileId,
        },
      });

    if (!state || state.status !== DriverOperationalStatus.AVAILABLE) {
      throw new ForbiddenException(
        'El conductor debe estar AVAILABLE ' + 'para recibir ofertas',
      );
    }
  }

  private normalizeFare(value: string): string {
    try {
      const cents = parseScaledDecimal(value, 2);

      if (cents <= 0n || cents > 999999n) {
        throw new Error('Monto fuera de rango');
      }

      return formatCents(cents);
    } catch {
      throw new BadRequestException('El precio propuesto no es válido');
    }
  }

  /*
   * OFFERED y PROPOSED pueden expirar.
   *
   * Una invitación u propuesta ya enviada deja de ser
   * válida cuando llega su expiresAt. Se reutiliza tanto
   * para "active" como para "proposals/pending".
   */
  private async expireStaleOffers(
    driverProfileId: string,
    now: Date,
  ): Promise<void> {
    await this.dataSource.getRepository(RideOffer).update(
      {
        driverProfileId,
        status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
        expiresAt: LessThanOrEqual(now),
      },
      {
        status: RideOfferStatus.EXPIRED,
        respondedAt: now,
      },
    );
  }

  private mapPendingProposal(
    offer: RideOffer,
  ): DriverPendingProposalResponseDto {
    const ride = offer.ride;

    return {
      offerId: offer.id,
      rideId: offer.rideId,
      status: RideOfferStatus.PROPOSED,

      /*
       * proposedFare siempre está presente en una
       * PROPOSED: proposeWithinTransaction lo asigna en
       * el mismo momento en que fija ese estado.
       */
      proposedFare: offer.proposedFare as string,

      passengerOfferFare: ride.passengerOfferFare ?? ride.estimatedFare,

      estimatedFare: ride.estimatedFare,

      currency: ride.currency,

      expiresAt: offer.expiresAt,

      distanceToOriginMeters: offer.distanceToOriginMeters,

      origin: {
        latitude: ride.originPosition.coordinates[1],

        longitude: ride.originPosition.coordinates[0],

        address: ride.originAddress,
      },

      destination: {
        latitude: ride.destinationPosition.coordinates[1],

        longitude: ride.destinationPosition.coordinates[0],

        address: ride.destinationAddress,
      },
    };
  }

  private mapOffer(
    offer: RideOffer,
    firstNamesByPassengerUserId: Map<string, string>,
  ): DriverRideOfferResponseDto {
    const ride = offer.ride;

    /*
     * Null-safe a propósito: si por inconsistencia no existe un
     * PassengerProfile para este passengerUserId (no debería pasar
     * en operación normal, pero la integridad referencial entre
     * User y PassengerProfile no está garantizada a nivel de FK),
     * el Driver simplemente no ve nombre — nunca "Pasajero" inventado.
     */
    const firstName =
      firstNamesByPassengerUserId.get(ride.passengerUserId) ?? null;

    return {
      id: offer.id,
      rideId: offer.rideId,
      status: offer.status,

      distanceToOriginMeters: offer.distanceToOriginMeters,

      dispatchRound: offer.dispatchRound,

      searchRadiusMeters: offer.searchRadiusMeters,

      proposedFare: offer.proposedFare,

      offeredAt: offer.offeredAt,

      expiresAt: offer.expiresAt,

      proposedAt: offer.proposedAt,

      respondedAt: offer.respondedAt,

      rejectionReason: offer.rejectionReason,

      ride: {
        id: ride.id,

        passenger: firstName === null ? null : { firstName },

        origin: {
          latitude: ride.originPosition.coordinates[1],

          longitude: ride.originPosition.coordinates[0],

          address: ride.originAddress,
        },

        destination: {
          latitude: ride.destinationPosition.coordinates[1],

          longitude: ride.destinationPosition.coordinates[0],

          address: ride.destinationAddress,
        },

        estimatedFare: ride.estimatedFare,

        passengerOfferFare: ride.passengerOfferFare ?? ride.estimatedFare,

        currency: ride.currency,

        passengerNotes: ride.passengerNotes,
      },
    };
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
