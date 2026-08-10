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
import { CounterRideOfferDto } from './dto/counter-ride-offer.dto';
import { DriverRideOfferResponseDto } from './dto/driver-ride-offer-response.dto';
import { RejectRideOfferDto } from './dto/reject-ride-offer.dto';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import {
  ACTIVE_DRIVER_RIDE_STATUSES,
  DRIVER_ACTIONABLE_RIDE_OFFER_STATUSES,
  OPEN_RIDE_OFFER_STATUSES,
} from './ride-matching.constants';
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

    /*
     * Toda negociación abierta puede expirar.
     *
     * Una propuesta ya enviada deja de ser
     * válida cuando llega su expiresAt.
     */
    await repository.update(
      {
        driverProfileId: profile.id,
        status: In([...OPEN_RIDE_OFFER_STATUSES]),
        expiresAt: LessThanOrEqual(now),
      },
      {
        status: RideOfferStatus.EXPIRED,
        respondedAt: now,
      },
    );

    /*
     * Al conductor solamente le devolvemos
     * como "activas" las solicitudes que
     * todavía puede responder.
     *
     * Una PROPOSED espera al pasajero.
     */
    const offers = await repository.find({
      where: {
        driverProfileId: profile.id,
        status: In([...DRIVER_ACTIONABLE_RIDE_OFFER_STATUSES]),
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

    return offers.map((offer) => this.mapOffer(offer));
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

    return this.mapOffer(offer);
  }

  /*
   * El conductor acepta exactamente el precio
   * vigente ofrecido por el pasajero.
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

    return this.mapOffer(outcome.offer);
  }

  /*
   * El conductor propone un precio superior
   * al precio vigente ofrecido por el pasajero.
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

    return this.mapOffer(outcome.offer);
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

    return this.mapOffer(outcome.offer);
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

    if (!DRIVER_ACTIONABLE_RIDE_OFFER_STATUSES.includes(offer.status)) {
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
            status: In([...OPEN_RIDE_OFFER_STATUSES]),
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
     * La negociación es individual por conductor.
     * Si el pasajero ya contraofertó en esta fila,
     * ese importe reemplaza solamente aquí a la
     * oferta inicial del viaje.
     */
    const passengerOfferFare = this.normalizeFare(
      this.currentPassengerFare(ride, offer),
    );

    let proposedFare = passengerOfferFare;

    /*
     * Si viene monto explícito, estamos ante
     * una contraoferta.
     */
    if (counterOfferFare !== null) {
      proposedFare = this.normalizeFare(counterOfferFare);

      const passengerCents = parseScaledDecimal(passengerOfferFare, 2);

      const proposedCents = parseScaledDecimal(proposedFare, 2);

      if (proposedCents <= passengerCents) {
        throw new BadRequestException(
          'La contraoferta debe ser mayor ' +
            'que el precio ofrecido por el pasajero',
        );
      }
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

    if (!DRIVER_ACTIONABLE_RIDE_OFFER_STATUSES.includes(offer.status)) {
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

  private mapOffer(offer: RideOffer): DriverRideOfferResponseDto {
    const ride = offer.ride;

    return {
      id: offer.id,
      rideId: offer.rideId,
      status: offer.status,

      distanceToOriginMeters: offer.distanceToOriginMeters,

      dispatchRound: offer.dispatchRound,

      searchRadiusMeters: offer.searchRadiusMeters,

      proposedFare: offer.proposedFare,

      passengerProposedAt: offer.passengerProposedAt,

      offeredAt: offer.offeredAt,

      expiresAt: offer.expiresAt,

      proposedAt: offer.proposedAt,

      respondedAt: offer.respondedAt,

      rejectionReason: offer.rejectionReason,

      ride: {
        id: ride.id,

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

        initialPassengerOfferFare:
          ride.passengerOfferFare ?? ride.estimatedFare,

        passengerOfferFare: this.currentPassengerFare(ride, offer),

        currency: ride.currency,

        passengerNotes: ride.passengerNotes,
      },
    };
  }

  private currentPassengerFare(ride: Ride, offer: RideOffer): string {
    return (
      offer.passengerProposedFare ??
      ride.passengerOfferFare ??
      ride.estimatedFare
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
