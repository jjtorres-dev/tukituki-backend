import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, In, LessThanOrEqual, MoreThan } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';

import { DriverLocationsService } from '../driver-operations/driver-locations.service';
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
import { OutboxEventType } from '../outbox/enums/outbox-event-type.enum';
import { OutboxService } from '../outbox/outbox.service';
import { RideOffer } from './entities/ride-offer.entity';
import { Ride } from './entities/ride.entity';
import { RideOfferStatus } from './enums/ride-offer-status.enum';
import { RideStatus } from './enums/ride-status.enum';
import {
  ACTIVE_DRIVER_RIDE_STATUSES,
  calculateRideOfferExpiresAt,
  DRIVER_LOCATION_MAX_AGE_MS,
  DRIVER_PRESENCE_MAX_AGE_MS,
  RIDE_MATCHING_CANDIDATE_LIMIT,
  RIDE_OFFER_BATCH_SIZE,
  RIDE_SEARCH_RADII_METERS,
} from './ride-matching.constants';
import { RideTransitionsService } from './ride-transitions.service';

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

      if (activeOffers.length > 0) {
        return {
          kind: 'existing',
          offers: activeOffers,
        };
      }

      const roundIndex = ride.dispatchRound ?? 0;
      const radiusMeters = RIDE_SEARCH_RADII_METERS[roundIndex];

      if (radiusMeters === undefined) {
        return {
          kind: 'skip',
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

      if (activeOffers.length > 0) {
        return activeOffers;
      }

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

      const expiresAt = calculateRideOfferExpiresAt(now, ride.searchExpiresAt);
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
          expiresAt,
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
