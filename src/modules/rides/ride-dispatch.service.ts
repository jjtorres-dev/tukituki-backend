import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DataSource,
  In,
  LessThanOrEqual,
  MoreThan,
  QueryFailedError,
} from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { DriverLocationsService } from '../driver-operations/driver-locations.service';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import {
  assertDriverOperationalRequirements,
  REQUIRED_OPERATIONAL_DOCUMENTS,
} from '../driver-operations/driver-operational-requirements.util';
import { DriverDocument } from '../drivers/entities/driver-document.entity';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { DriverDocumentStatus } from '../drivers/enums/driver-document-status.enum';
import { DriverDocumentType } from '../drivers/enums/driver-document-type.enum';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { VehicleStatus } from '../drivers/enums/vehicle-status.enum';
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import {
  ACTIVE_DRIVER_RIDE_STATUSES,
  DRIVER_LOCATION_MAX_AGE_MS,
  DRIVER_PRESENCE_MAX_AGE_MS,
  RIDE_DISPATCH_INTERVAL_MS,
  RIDE_MATCHING_CANDIDATE_LIMIT,
  RIDE_OFFER_BATCH_SIZE,
  RIDE_SEARCH_RADII_METERS,
} from './ride-matching.constants';
import { RideTransitionsService } from './ride-transitions.service';
import { withRideAdvisoryLock } from './ride-advisory-lock.util';

interface DispatchPlan {
  rideId: string;
  roundIndex: number;
  radiusMeters: number;
  latitude: number;
  longitude: number;
}

type DispatchPreparation =
  | {
      kind: 'plan';
      plan: DispatchPlan;
    }
  | {
      kind: 'existing';
      offers: RideOffer[];
    }
  | {
      kind: 'skip';
    };

@Injectable()
export class RideDispatchService {
  private readonly logger = new Logger(RideDispatchService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly driverLocationsService: DriverLocationsService,
    private readonly transitionsService: RideTransitionsService,
    @Optional() private readonly outboxService?: OutboxService,
  ) {}

  async dispatchRide(rideId: string): Promise<RideOffer[]> {
    const preparation = await this.prepareDispatch(rideId);

    if (preparation.kind === 'existing') {
      return preparation.offers;
    }

    if (preparation.kind === 'skip') {
      return [];
    }

    const { plan } = preparation;
    const candidates =
      await this.driverLocationsService.findNearbyAvailableDrivers(
        plan.latitude,
        plan.longitude,
        plan.radiusMeters,
        RIDE_MATCHING_CANDIDATE_LIMIT,
      );

    return this.createOffersForPlan(plan, candidates);
  }

  expirePendingOffers(rideId: string): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      const ride = await this.lockRide(manager, rideId);
      const now = new Date();
      let affected = await this.expireOfferedRows(
        manager.getRepository(RideOffer),
        ride.id,
        now,
      );

      if (
        ride.status === RideStatus.SEARCHING_DRIVER &&
        ride.searchExpiresAt.getTime() <= now.getTime()
      ) {
        await this.transitionsService.expireWithinTransaction(
          manager,
          ride,
          now,
        );
        affected += await this.expireAllOfferedRows(
          manager.getRepository(RideOffer),
          ride.id,
          now,
        );
      }

      return affected;
    });
  }

  /*
   * G3A - late-join matching.
   *
   * Punto de entrada driver-céntrico (en vez de ride-céntrico como
   * dispatchRide): dado un conductor que ACABA de volverse
   * realmente descubrible (ver
   * DriverAvailabilityRedisService.registerDiscoverableTransition),
   * busca Rides SEARCHING_DRIVER vigentes cercanos que este
   * conductor todavía no haya recibido y les crea RideOffer
   * reutilizando exactamente las mismas reglas, locks y outbox que
   * el dispatch por rondas.
   *
   * NO asigna Ride, NO muta dispatchRound: solo puede crear una
   * oferta adicional dentro del radio que la ride ya alcanzó.
   */
  async dispatchLateJoinDriver(driverProfileId: string): Promise<RideOffer[]> {
    const maxRadiusMeters =
      RIDE_SEARCH_RADII_METERS[RIDE_SEARCH_RADII_METERS.length - 1];

    const candidateRideIds = await this.findNearbySearchingRideIds(
      driverProfileId,
      maxRadiusMeters,
      RIDE_MATCHING_CANDIDATE_LIMIT,
    );

    const offers: RideOffer[] = [];

    for (const rideId of candidateRideIds) {
      const { result } = await withRideAdvisoryLock(
        this.dataSource,
        rideId,
        () => this.tryCreateLateJoinOffer(rideId, driverProfileId),
      );

      if (result) {
        offers.push(result);
      }
    }

    if (candidateRideIds.length > 0) {
      this.logger.log(
        `lateJoinMatch driverId=${driverProfileId} eligibleRideCount=${candidateRideIds.length} offersCreated=${offers.length}`,
      );
    }

    return offers;
  }

  private async findNearbySearchingRideIds(
    driverProfileId: string,
    radiusMeters: number,
    limit: number,
  ): Promise<string[]> {
    const rows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT ride.id
       FROM rides ride
       INNER JOIN driver_locations location
         ON location.driver_profile_id = $1
       WHERE ride.status = 'SEARCHING_DRIVER'
         AND ride.search_expires_at > NOW()
         AND ST_DWithin(ride.origin_position, location.position, $2)
         AND NOT EXISTS (
           SELECT 1
           FROM ride_offers existing
           WHERE existing.ride_id = ride.id
             AND existing.driver_profile_id = $1
         )
       ORDER BY ST_Distance(ride.origin_position, location.position) ASC
       LIMIT $3`,
      [driverProfileId, radiusMeters, limit],
    );

    return rows.map((row) => row.id);
  }

  private async tryCreateLateJoinOffer(
    rideId: string,
    driverProfileId: string,
  ): Promise<RideOffer | null> {
    return this.dataSource.transaction(async (manager) => {
      const ride = await manager.getRepository(Ride).findOne({
        where: {
          id: rideId,
        },
        lock: {
          mode: 'pessimistic_write',
        },
      });

      if (!ride || ride.status !== RideStatus.SEARCHING_DRIVER) {
        return null;
      }

      const now = new Date();

      if (ride.searchExpiresAt.getTime() <= now.getTime()) {
        return null;
      }

      const offerRepository = manager.getRepository(RideOffer);

      const existingOffer = await offerRepository.findOne({
        where: {
          rideId,
          driverProfileId,
        },
      });

      if (existingOffer) {
        return null;
      }

      const eligible = await this.isDriverEligibleForLateJoin(
        manager,
        driverProfileId,
        now,
      );

      if (!eligible) {
        return null;
      }

      const distanceMeters = await this.distanceToRideOrigin(
        manager,
        rideId,
        driverProfileId,
      );

      if (distanceMeters === null) {
        return null;
      }

      const applicableRadiusMeters =
        RIDE_SEARCH_RADII_METERS[
          Math.min(ride.dispatchRound ?? 0, RIDE_SEARCH_RADII_METERS.length - 1)
        ];

      if (distanceMeters > applicableRadiusMeters) {
        return null;
      }

      /*
       * G3B1: la visibilidad de OFFERED ya no depende de un TTL
       * técnico corto — dura hasta que termina la ventana real de
       * búsqueda del Ride, igual que ya hace PROPOSED.
       */
      const offer = offerRepository.create({
        rideId: ride.id,
        driverProfileId,
        status: RideOfferStatus.OFFERED,
        distanceToOriginMeters: Math.max(0, Math.round(distanceMeters)),
        dispatchRound: ride.dispatchRound ?? 0,
        searchRadiusMeters: applicableRadiusMeters,
        offeredAt: now,
        expiresAt: ride.searchExpiresAt,
        proposedFare: null,
        proposedAt: null,
        respondedAt: null,
        acceptedAt: null,
        rejectedAt: null,
        cancelledAt: null,
        rejectionReason: null,
      });

      let savedOffer: RideOffer;

      try {
        savedOffer = await offerRepository.save(offer);
      } catch (error: unknown) {
        if (this.isUniqueViolation(error)) {
          return null;
        }

        throw error;
      }

      if (this.outboxService) {
        await this.outboxService.enqueueWithinTransaction(manager, {
          aggregateType: 'RIDE_OFFER',
          aggregateId: savedOffer.id,
          eventType: OutboxEventType.RIDE_OFFER_CREATED,
          payload: {
            rideId: ride.id,
            driverProfileId: savedOffer.driverProfileId,
            dispatchRound: savedOffer.dispatchRound,
            expiresAt: savedOffer.expiresAt.toISOString(),
          },
        });
      }

      return savedOffer;
    });
  }

  private async isDriverEligibleForLateJoin(
    manager: EntityManager,
    driverProfileId: string,
    now: Date,
  ): Promise<boolean> {
    const state = await manager
      .getRepository(DriverOperationalState)
      .createQueryBuilder('state')
      .where('state.driver_profile_id = :driverProfileId', {
        driverProfileId,
      })
      .andWhere('state.status = :status', {
        status: DriverOperationalStatus.AVAILABLE,
      })
      .setLock('pessimistic_write')
      .getOne();

    if (!state) {
      return false;
    }

    const minimumLastSeenAt = new Date(
      now.getTime() - DRIVER_PRESENCE_MAX_AGE_MS,
    );

    if (
      !state.lastSeenAt ||
      state.lastSeenAt.getTime() < minimumLastSeenAt.getTime()
    ) {
      return false;
    }

    const profile = await manager.getRepository(DriverProfile).findOne({
      where: {
        id: driverProfileId,
      },
    });

    if (!profile || profile.status !== DriverStatus.APPROVED) {
      return false;
    }

    const vehicle = await manager.getRepository(DriverVehicle).findOne({
      where: {
        driverProfileId,
      },
    });

    const documents = await manager.getRepository(DriverDocument).find({
      where: {
        driverProfileId,
        type: In([...REQUIRED_OPERATIONAL_DOCUMENTS]),
      },
    });

    try {
      assertDriverOperationalRequirements(
        vehicle,
        documents,
        now.toISOString().slice(0, 10),
      );
    } catch {
      return false;
    }

    const minimumLocationAt = new Date(
      now.getTime() - DRIVER_LOCATION_MAX_AGE_MS,
    );

    const location = await manager.getRepository(DriverLocation).findOne({
      where: {
        driverProfileId,
      },
    });

    if (
      !location ||
      location.recordedAt.getTime() < minimumLocationAt.getTime()
    ) {
      return false;
    }

    const activeRide = await manager.getRepository(Ride).findOne({
      where: {
        driverProfileId,
        status: In([...ACTIVE_DRIVER_RIDE_STATUSES]),
      },
    });

    return !activeRide;
  }

  private async distanceToRideOrigin(
    manager: EntityManager,
    rideId: string,
    driverProfileId: string,
  ): Promise<number | null> {
    const rows: Array<{ distanceMeters: string | number | null }> =
      await manager.query(
        `SELECT ST_Distance(location.position, ride.origin_position) AS "distanceMeters"
         FROM driver_locations location
         INNER JOIN rides ride ON ride.id = $1
         WHERE location.driver_profile_id = $2
         LIMIT 1`,
        [rideId, driverProfileId],
      );

    const distanceMeters = Number(rows[0]?.distanceMeters);

    return Number.isFinite(distanceMeters) ? distanceMeters : null;
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

  /*
   * G3B1: la cadencia de rondas ya NO depende de que exista o no
   * una RideOffer OFFERED viva (esa era la responsabilidad B que
   * RIDE_OFFER_TTL_MS mezclaba con la visibilidad del Driver).
   *
   * Ahora una ride está "due" para otra ronda únicamente por:
   * - seguir SEARCHING_DRIVER y vigente;
   * - no haber agotado el límite de rondas (RIDE_SEARCH_RADII_METERS);
   * - haber pasado RIDE_DISPATCH_INTERVAL_MS desde lastDispatchAt.
   *
   * Si no está due (límite de rondas agotado, o todavía muy pronto),
   * se devuelven las OFFERED actualmente vigentes como "existing":
   * es un no-op informativo, no dispara ni bloquea nada nuevo.
   */
  private prepareDispatch(rideId: string): Promise<DispatchPreparation> {
    return this.dataSource.transaction(async (manager) => {
      const ride = await this.lockRide(manager, rideId);
      const now = new Date();
      const offerRepository = manager.getRepository(RideOffer);

      await this.expireOfferedRows(offerRepository, ride.id, now);

      if (ride.status !== RideStatus.SEARCHING_DRIVER) {
        return {
          kind: 'skip',
        };
      }

      if (ride.searchExpiresAt.getTime() <= now.getTime()) {
        await this.transitionsService.expireWithinTransaction(
          manager,
          ride,
          now,
        );
        await this.expireAllOfferedRows(offerRepository, ride.id, now);

        return {
          kind: 'skip',
        };
      }

      const roundIndex = ride.dispatchRound ?? 0;
      const radiusMeters = RIDE_SEARCH_RADII_METERS[roundIndex];

      const dispatchIntervalElapsed =
        !ride.lastDispatchAt ||
        now.getTime() - ride.lastDispatchAt.getTime() >=
          RIDE_DISPATCH_INTERVAL_MS;

      if (radiusMeters === undefined || !dispatchIntervalElapsed) {
        const activeOffers = await offerRepository.find({
          where: {
            rideId: ride.id,
            status: RideOfferStatus.OFFERED,
            expiresAt: MoreThan(now),
          },
          order: {
            distanceToOriginMeters: 'ASC',
          },
        });

        return {
          kind: 'existing',
          offers: activeOffers,
        };
      }

      return {
        kind: 'plan',
        plan: {
          rideId: ride.id,
          roundIndex,
          radiusMeters,
          latitude: ride.originPosition.coordinates[1],
          longitude: ride.originPosition.coordinates[0],
        },
      };
    });
  }

  private createOffersForPlan(
    plan: DispatchPlan,
    candidates: Array<{
      driverProfileId: string;
      distanceMeters: number;
    }>,
  ): Promise<RideOffer[]> {
    return this.dataSource.transaction(async (manager) => {
      const ride = await this.lockRide(manager, plan.rideId);
      const now = new Date();
      const rideRepository = manager.getRepository(Ride);
      const offerRepository = manager.getRepository(RideOffer);

      await this.expireOfferedRows(offerRepository, ride.id, now);

      if (ride.status !== RideStatus.SEARCHING_DRIVER) {
        return [];
      }

      if (ride.searchExpiresAt.getTime() <= now.getTime()) {
        await this.transitionsService.expireWithinTransaction(
          manager,
          ride,
          now,
        );
        await this.expireAllOfferedRows(offerRepository, ride.id, now);

        return [];
      }

      /*
       * G3B1: ya NO se corta aquí por haber ofertas OFFERED todavía
       * vivas de rondas anteriores — eso es exactamente lo que
       * bloqueaba nuevas rondas mientras un Driver no respondía.
       * previouslyOfferedDriverIds (más abajo) sigue evitando que
       * cualquiera de esos Drivers reciba una oferta duplicada.
       *
       * Sí seguimos abortando si la ronda ya avanzó de forma
       * concurrente desde que prepareDispatch armó este plan.
       */
      if ((ride.dispatchRound ?? 0) !== plan.roundIndex) {
        return [];
      }

      ride.dispatchRound = plan.roundIndex + 1;
      ride.lastDispatchAt = now;
      await rideRepository.save(ride);

      if (candidates.length === 0) {
        return [];
      }

      const previousOffers = await offerRepository.find({
        where: {
          rideId: ride.id,
        },
        select: {
          driverProfileId: true,
        },
      });
      const previouslyOfferedDriverIds = new Set(
        previousOffers.map((offer) => offer.driverProfileId),
      );
      const freshCandidates = candidates.filter(
        (candidate) =>
          !previouslyOfferedDriverIds.has(candidate.driverProfileId),
      );

      if (freshCandidates.length === 0) {
        return [];
      }

      const eligibleDriverIds = await this.findEligibleDriverIds(
        manager,
        freshCandidates.map((candidate) => candidate.driverProfileId),
        now,
      );
      const eligibleSet = new Set(eligibleDriverIds);
      const selectedCandidates = freshCandidates
        .filter((candidate) => eligibleSet.has(candidate.driverProfileId))
        .slice(0, RIDE_OFFER_BATCH_SIZE);

      if (selectedCandidates.length === 0) {
        return [];
      }

      const offers = selectedCandidates.map((candidate) =>
        offerRepository.create({
          rideId: ride.id,
          driverProfileId: candidate.driverProfileId,
          status: RideOfferStatus.OFFERED,
          distanceToOriginMeters: Math.max(
            0,
            Math.round(candidate.distanceMeters),
          ),
          dispatchRound: plan.roundIndex + 1,
          searchRadiusMeters: plan.radiusMeters,
          offeredAt: now,
          expiresAt: ride.searchExpiresAt,
          proposedFare: null,
          proposedAt: null,
          respondedAt: null,
          acceptedAt: null,
          rejectedAt: null,
          cancelledAt: null,
          rejectionReason: null,
        }),
      );

      const savedOffers = await offerRepository.save(offers);

      if (this.outboxService) {
        for (const offer of savedOffers) {
          await this.outboxService.enqueueWithinTransaction(manager, {
            aggregateType: 'RIDE_OFFER',
            aggregateId: offer.id,
            eventType: OutboxEventType.RIDE_OFFER_CREATED,
            payload: {
              rideId: ride.id,
              driverProfileId: offer.driverProfileId,
              dispatchRound: offer.dispatchRound,
              expiresAt: offer.expiresAt.toISOString(),
            },
          });
        }
      }

      return savedOffers;
    });
  }

  private async findEligibleDriverIds(
    manager: EntityManager,
    candidateIds: string[],
    now: Date,
  ): Promise<string[]> {
    if (candidateIds.length === 0) {
      return [];
    }

    const sortedIds = [...new Set(candidateIds)].sort();
    const stateRepository = manager.getRepository(DriverOperationalState);
    const lockedStates = await stateRepository
      .createQueryBuilder('state')
      .where('state.driver_profile_id IN (:...driverProfileIds)', {
        driverProfileIds: sortedIds,
      })
      .andWhere('state.status = :status', {
        status: DriverOperationalStatus.AVAILABLE,
      })
      .orderBy('state.driver_profile_id', 'ASC')
      .setLock('pessimistic_write')
      .getMany();
    const availableIds = lockedStates.map((state) => state.driverProfileId);

    if (availableIds.length === 0) {
      return [];
    }

    const today = now.toISOString().slice(0, 10);
    const minimumLastSeenAt = new Date(
      now.getTime() - DRIVER_PRESENCE_MAX_AGE_MS,
    );
    const minimumLocationAt = new Date(
      now.getTime() - DRIVER_LOCATION_MAX_AGE_MS,
    );
    const eligibleProfiles = await manager
      .getRepository(DriverProfile)
      .createQueryBuilder('profile')
      .innerJoin(
        DriverVehicle,
        'vehicle',
        'vehicle.driver_profile_id = profile.id',
      )
      .innerJoin(
        DriverLocation,
        'location',
        'location.driver_profile_id = profile.id',
      )
      .innerJoin(
        DriverOperationalState,
        'state',
        'state.driver_profile_id = profile.id',
      )
      .innerJoin(
        DriverDocument,
        'license',
        `license.driver_profile_id = profile.id
          AND license.type = :licenseType`,
        {
          licenseType: DriverDocumentType.DRIVER_LICENSE,
        },
      )
      .innerJoin(
        DriverDocument,
        'soat',
        `soat.driver_profile_id = profile.id
          AND soat.type = :soatType`,
        {
          soatType: DriverDocumentType.SOAT,
        },
      )
      .where('profile.id IN (:...driverProfileIds)', {
        driverProfileIds: availableIds,
      })
      .andWhere('profile.status = :profileStatus', {
        profileStatus: DriverStatus.APPROVED,
      })
      .andWhere('vehicle.status = :vehicleStatus', {
        vehicleStatus: VehicleStatus.APPROVED,
      })
      .andWhere('state.status = :operationalStatus', {
        operationalStatus: DriverOperationalStatus.AVAILABLE,
      })
      .andWhere('state.last_seen_at >= :minimumLastSeenAt', {
        minimumLastSeenAt,
      })
      .andWhere('location.recorded_at >= :minimumLocationAt', {
        minimumLocationAt,
      })
      .andWhere('license.status = :documentStatus', {
        documentStatus: DriverDocumentStatus.APPROVED,
      })
      .andWhere('soat.status = :documentStatus', {
        documentStatus: DriverDocumentStatus.APPROVED,
      })
      .andWhere('license.expires_at >= :today', {
        today,
      })
      .andWhere('soat.expires_at >= :today', {
        today,
      })
      .distinct(true)
      .getMany();
    const eligibleIds = eligibleProfiles.map((profile) => profile.id);

    if (eligibleIds.length === 0) {
      return [];
    }

    const ridesInProgress = await manager.getRepository(Ride).find({
      where: {
        driverProfileId: In(eligibleIds),
        status: In([...ACTIVE_DRIVER_RIDE_STATUSES]),
      },
      select: {
        driverProfileId: true,
      },
    });
    const busyDriverIds = new Set(
      ridesInProgress
        .map((ride) => ride.driverProfileId)
        .filter((driverProfileId): driverProfileId is string =>
          Boolean(driverProfileId),
        ),
    );

    return eligibleIds.filter(
      (driverProfileId) => !busyDriverIds.has(driverProfileId),
    );
  }

  private async expireAllOfferedRows(
    repository: Repository<RideOffer>,
    rideId: string,
    now: Date,
  ): Promise<number> {
    const result = await repository.update(
      {
        rideId,
        status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
      },
      {
        status: RideOfferStatus.EXPIRED,
        respondedAt: now,
      },
    );

    return result.affected ?? 0;
  }

  private async expireOfferedRows(
    repository: Repository<RideOffer>,
    rideId: string,
    now: Date,
  ): Promise<number> {
    const result = await repository.update(
      {
        rideId,
        status: In([RideOfferStatus.OFFERED, RideOfferStatus.PROPOSED]),
        expiresAt: LessThanOrEqual(now),
      },
      {
        status: RideOfferStatus.EXPIRED,
        respondedAt: now,
      },
    );

    return result.affected ?? 0;
  }

  private async lockRide(
    manager: EntityManager,
    rideId: string,
  ): Promise<Ride> {
    const ride = await manager.getRepository(Ride).findOne({
      where: {
        id: rideId,
      },
      lock: {
        mode: 'pessimistic_write',
      },
    });

    if (!ride) {
      throw new NotFoundException('El viaje no existe');
    }

    return ride;
  }
}
