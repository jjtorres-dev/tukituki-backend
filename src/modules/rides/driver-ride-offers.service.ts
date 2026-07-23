import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  In,
  LessThanOrEqual,
  MoreThan,
  QueryFailedError,
} from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { DriverRideOfferResponseDto } from './dto/driver-ride-offer-response.dto';
import { RejectRideOfferDto } from './dto/reject-ride-offer.dto';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import { ACTIVE_DRIVER_RIDE_STATUSES } from './ride-matching.constants';
import { RideDispatchService } from './ride-dispatch.service';
import { RideTransitionsService } from './ride-transitions.service';
import { RideRealtimeService } from './realtime/ride-realtime.service';

interface AcceptedOutcome {
  kind: 'accepted';
  offer: RideOffer;
  driverProfileId: string;
}

interface ExpiredOutcome {
  kind: 'expired';
}

interface UnavailableOutcome {
  kind: 'unavailable';
}

type AcceptOutcome = AcceptedOutcome | ExpiredOutcome | UnavailableOutcome;

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
    private readonly availabilityRedisService: DriverAvailabilityRedisService,
    private readonly transitionsService: RideTransitionsService,
    private readonly realtimeService: RideRealtimeService,
  ) {}

  async getActiveOffers(userId: string): Promise<DriverRideOfferResponseDto[]> {
    const profile = await this.getApprovedProfile(userId);
    await this.assertDriverIsAvailable(profile.id);

    const now = new Date();
    const repository = this.dataSource.getRepository(RideOffer);

    await repository.update(
      {
        driverProfileId: profile.id,
        status: RideOfferStatus.OFFERED,
        expiresAt: LessThanOrEqual(now),
      },
      {
        status: RideOfferStatus.EXPIRED,
        respondedAt: now,
      },
    );

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

  async acceptOffer(
    userId: string,
    offerId: string,
  ): Promise<DriverRideOfferResponseDto> {
    try {
      const outcome = await this.dataSource.transaction((manager) =>
        this.acceptWithinTransaction(manager, userId, offerId),
      );

      if (outcome.kind === 'expired') {
        throw new ConflictException('La oferta ya venció');
      }

      if (outcome.kind === 'unavailable') {
        throw new ConflictException(
          'El viaje ya no está disponible para asignación',
        );
      }

      await this.availabilityRedisService
        .registerBusyPresence(outcome.driverProfileId)
        .catch((error: unknown) => {
          this.logger.warn(
            `El conductor ${outcome.driverProfileId} quedó BUSY ` +
              'en PostgreSQL, pero Redis no pudo actualizarse: ' +
              this.errorMessage(error),
          );
        });

      try {
        this.realtimeService.emitAssigned(outcome.offer.ride);
        this.realtimeService.emitStatusChanged(
          outcome.offer.ride,
          RideStatus.SEARCHING_DRIVER,
        );
      } catch (error: unknown) {
        this.logger.warn(
          `El viaje ${outcome.offer.rideId} fue asignado, ` +
            `pero no pudo emitirse por WebSocket: ${this.errorMessage(error)}`,
        );
      }

      return this.mapOffer(outcome.offer);
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'La solicitud ya fue asignada a otro conductor',
        );
      }

      throw error;
    }
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
          `No pudo continuarse el matching del viaje ${outcome.rideId}: ` +
            this.errorMessage(error),
        );
      });

    return this.mapOffer(outcome.offer);
  }

  private async acceptWithinTransaction(
    manager: EntityManager,
    userId: string,
    offerId: string,
  ): Promise<AcceptOutcome> {
    const profile = await this.lockApprovedProfile(manager, userId);
    const offerRepository = manager.getRepository(RideOffer);
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

    if (offer.expiresAt.getTime() <= now.getTime()) {
      offer.status = RideOfferStatus.EXPIRED;
      offer.respondedAt = now;
      await offerRepository.save(offer);

      return {
        kind: 'expired',
      };
    }

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
            status: RideOfferStatus.OFFERED,
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

    offer.status = RideOfferStatus.ACCEPTED;
    offer.respondedAt = now;
    offer.acceptedAt = now;
    offer.cancelledAt = null;
    offer.rejectedAt = null;
    offer.rejectionReason = null;

    operationalState.status = DriverOperationalStatus.BUSY;
    operationalState.lastSeenAt = now;

    const savedOffer = await offerRepository.save(offer);
    await this.transitionsService.assignDriverWithinTransaction(
      manager,
      ride,
      profile.id,
      userId,
      offer.id,
      now,
    );
    await manager.getRepository(DriverOperationalState).save(operationalState);

    await offerRepository.update(
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

    await offerRepository.update(
      {
        driverProfileId: profile.id,
        status: RideOfferStatus.OFFERED,
      },
      {
        status: RideOfferStatus.CANCELLED,
        respondedAt: now,
        cancelledAt: now,
      },
    );

    savedOffer.ride = ride;

    return {
      kind: 'accepted',
      offer: savedOffer,
      driverProfileId: profile.id,
    };
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
        'El conductor debe estar AVAILABLE para responder ofertas',
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
        'El conductor debe estar AVAILABLE para recibir ofertas',
      );
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
      offeredAt: offer.offeredAt,
      expiresAt: offer.expiresAt,
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
        currency: ride.currency,
        passengerNotes: ride.passengerNotes,
      },
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }
}
