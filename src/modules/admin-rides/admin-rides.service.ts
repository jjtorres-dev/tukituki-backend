import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, SelectQueryBuilder } from 'typeorm';

import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverVehicle } from '../drivers/entities/driver-vehicle.entity';
import { VehicleType } from '../drivers/enums/vehicle-type.enum';
import { PassengerProfile } from '../passengers/entities/passenger-profile.entity';
import { RideCancellation } from '../rides/entities/ride-cancellation.entity';
import { RideFinalFare } from '../rides/entities/ride-final-fare.entity';
import { RideLocationSample } from '../rides/entities/ride-location-sample.entity';
import { RideOffer } from '../rides/entities/ride-offer.entity';
import { RideProgressMetrics } from '../rides/entities/ride-progress-metrics.entity';
import { RideRating } from '../rides/entities/ride-rating.entity';
import { RideStatusHistory } from '../rides/entities/ride-status-history.entity';
import { RideWaiting } from '../rides/entities/ride-waiting.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { RideSafetyIncident } from '../safety/entities/ride-safety-incident.entity';
import { SafetyIncidentStatus } from '../safety/enums/safety-incident-status.enum';
import { AvatarUrlResolverService } from '../storage/avatar-url-resolver.service';
import { AdminRideLocationQueryDto } from './dto/admin-ride-location-query.dto';
import { AdminRideQueryDto } from './dto/admin-ride-query.dto';
import {
  AdminRideDetailResponseDto,
  AdminRideListItemDto,
  AdminRideListResponseDto,
  AdminRideLocationListResponseDto,
  AdminRideTimelineResponseDto,
} from './dto/admin-ride-response.dto';

const ACTIVE_RIDE_STATUSES: readonly RideStatus[] = [
  RideStatus.SEARCHING_DRIVER,
  RideStatus.DRIVER_ASSIGNED,
  RideStatus.DRIVER_ARRIVING,
  RideStatus.DRIVER_ARRIVED,
  RideStatus.IN_PROGRESS,
];

const OPEN_SAFETY_STATUSES: readonly SafetyIncidentStatus[] = [
  SafetyIncidentStatus.OPEN,
  SafetyIncidentStatus.ACKNOWLEDGED,
  SafetyIncidentStatus.IN_REVIEW,
];

interface AdminRideSummaryRaw {
  id: string;
  status: RideStatus;
  stateVersion: number | string;
  passengerUserId: string;
  passengerProfileId: string | null;
  passengerPhoneE164: string;
  passengerFirstName: string | null;
  passengerLastName: string | null;
  passengerPhotoUrl: string | null;
  passengerPhotoObjectKey: string | null;
  passengerRatingAverage: string | null;
  driverProfileId: string | null;
  driverUserId: string | null;
  driverPhoneE164: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  driverPhotoUrl: string | null;
  driverPhotoObjectKey: string | null;
  driverRatingAverage: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehicleType: VehicleType | null;
  originZoneId: string;
  originZoneCode: string;
  originZoneName: string;
  destinationZoneId: string;
  destinationZoneCode: string;
  destinationZoneName: string;
  originLatitude: number | string;
  originLongitude: number | string;
  originAddress: string;
  destinationLatitude: number | string;
  destinationLongitude: number | string;
  destinationAddress: string;
  distanceMeters: number | string;
  estimatedDurationSeconds: number | string;
  estimatedFare: string;
  finalFare: string | null;
  currency: string;
  driverLatitude: number | string | null;
  driverLongitude: number | string | null;
  driverAccuracy: number | string | null;
  driverHeading: number | string | null;
  driverSpeed: number | string | null;
  driverLocationRecordedAt: Date | string | null;
  hasCancellation: boolean | string | number;
  openSafetyIncidentCount: number | string;
  requestedAt: Date | string;
  driverAssignedAt: Date | string | null;
  startedAt: Date | string | null;
  completedAt: Date | string | null;
  cancelledAt: Date | string | null;
  updatedAt: Date | string;
}

@Injectable()
export class AdminRidesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly avatarResolver: AvatarUrlResolverService,
  ) {}

  async list(
    query: AdminRideQueryDto,
    activeOnly = false,
  ): Promise<AdminRideListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const builder = this.buildSummaryQuery(query, activeOnly);
    const total = await builder.clone().getCount();
    const rawItems = await builder
      .orderBy('ride.requested_at', 'DESC')
      .addOrderBy('ride.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<AdminRideSummaryRaw>();

    return {
      items: rawItems.map((item) => this.mapSummary(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  async getDetail(rideId: string): Promise<AdminRideDetailResponseDto> {
    const [ride, summaryRaw] = await Promise.all([
      this.dataSource.getRepository(Ride).findOne({ where: { id: rideId } }),
      this.buildSummaryQuery({}, false)
        .andWhere('ride.id = :rideId', { rideId })
        .getRawOne<AdminRideSummaryRaw>(),
    ]);
    if (!ride || !summaryRaw) {
      throw new NotFoundException('El viaje no existe');
    }

    const [
      tracking,
      finalFare,
      cancellation,
      waiting,
      offers,
      safetyIncidents,
      ratings,
    ] = await Promise.all([
      this.dataSource
        .getRepository(RideProgressMetrics)
        .findOne({ where: { rideId } }),
      this.dataSource
        .getRepository(RideFinalFare)
        .findOne({ where: { rideId } }),
      this.dataSource
        .getRepository(RideCancellation)
        .findOne({ where: { rideId } }),
      this.dataSource.getRepository(RideWaiting).findOne({ where: { rideId } }),
      this.dataSource.getRepository(RideOffer).find({
        where: { rideId },
        relations: { driverProfile: true },
        order: { offeredAt: 'DESC' },
      }),
      this.dataSource.getRepository(RideSafetyIncident).find({
        where: { rideId },
        order: { createdAt: 'DESC' },
      }),
      this.dataSource.getRepository(RideRating).find({
        where: { rideId },
        order: { createdAt: 'ASC' },
      }),
    ]);

    return {
      summary: this.mapSummary(summaryRaw),
      passengerNotes: ride.passengerNotes,
      dispatchRound: ride.dispatchRound,
      searchExpiresAt: ride.searchExpiresAt,
      pricing: {
        baseFare: ride.pricingBaseFare,
        minimumFare: ride.pricingMinimumFare,
        pricePerKm: ride.pricingPricePerKm,
        pricePerMinute: ride.pricingPricePerMinute,
        bookingFee: ride.pricingBookingFee,
        adjustmentMultiplier: ride.pricingAdjustmentMultiplier,
        calculationVersion: ride.pricingCalculationVersion,
      },
      completion: {
        actualDistanceMeters: ride.actualDistanceMeters,
        actualDurationSeconds: ride.actualDurationSeconds,
        destinationArrivalDistanceMeters: ride.destinationArrivalDistanceMeters,
        calculatedFinalFare: ride.calculatedFinalFare,
        fareWasCapped: ride.fareWasCapped,
        notes: ride.completionNotes,
      },
      tracking: tracking
        ? {
            acceptedSamples: tracking.acceptedSamples,
            rejectedSamples: tracking.rejectedSamples,
            trackedDistanceMeters: tracking.trackedDistanceMeters,
            calculatedDurationSeconds: tracking.calculatedDurationSeconds,
            lastReceivedSampleAt: tracking.lastReceivedSampleAt,
            lastAcceptedSampleAt: tracking.lastAcceptedSampleAt,
          }
        : null,
      finalFare: finalFare
        ? {
            baseFare: finalFare.baseFare,
            distanceAmount: finalFare.distanceAmount,
            timeAmount: finalFare.timeAmount,
            bookingFee: finalFare.bookingFee,
            subtotal: finalFare.subtotal,
            adjustmentMultiplier: finalFare.adjustmentMultiplier,
            calculatedFinalFare: finalFare.calculatedFinalFare,
            finalFare: finalFare.finalFare,
            fareCapAmount: finalFare.fareCapAmount,
            fareWasCapped: finalFare.fareWasCapped,
            currency: finalFare.currency,
          }
        : null,
      cancellation: cancellation
        ? {
            id: cancellation.id,
            actorType: cancellation.actorType,
            actorUserId: cancellation.actorUserId,
            reasonCode: cancellation.reasonCode,
            reasonDetail: cancellation.reasonDetail,
            rideStatusBefore: cancellation.rideStatusBefore,
            cancellationType: cancellation.cancellationType,
            calculatedFee: cancellation.calculatedFee,
            chargedFee: cancellation.chargedFee,
            waivedAmount: cancellation.waivedAmount,
            feeStatus: cancellation.feeStatus,
            currency: cancellation.currency,
            createdAt: cancellation.createdAt,
          }
        : null,
      waiting: waiting
        ? {
            waitingStartedAt: waiting.waitingStartedAt,
            noShowAvailableAt: waiting.noShowAvailableAt,
            requiredWaitingSeconds: waiting.requiredWaitingSeconds,
            startDistanceMeters: waiting.startDistanceMeters,
          }
        : null,
      offers: offers.map((offer) => ({
        id: offer.id,
        driverProfileId: offer.driverProfileId,
        driverName: `${offer.driverProfile.firstName} ${offer.driverProfile.lastName}`,
        status: offer.status,
        distanceToOriginMeters: offer.distanceToOriginMeters,
        dispatchRound: offer.dispatchRound,
        searchRadiusMeters: offer.searchRadiusMeters,
        offeredAt: offer.offeredAt,
        expiresAt: offer.expiresAt,
        respondedAt: offer.respondedAt,
        rejectionReason: offer.rejectionReason,
      })),
      safetyIncidents: safetyIncidents.map((incident) => ({
        id: incident.id,
        incidentType: incident.incidentType,
        severity: incident.severity,
        status: incident.status,
        reporterRole: incident.reporterRole,
        createdAt: incident.createdAt,
        updatedAt: incident.updatedAt,
      })),
      ratings: ratings.map((rating) => ({
        id: rating.id,
        reviewerRole: rating.reviewerRole,
        score: rating.score,
        comment: rating.comment,
        tags: rating.tags,
        createdAt: rating.createdAt,
      })),
    };
  }

  async getTimeline(rideId: string): Promise<AdminRideTimelineResponseDto> {
    await this.assertRideExists(rideId);
    const history = await this.dataSource
      .getRepository(RideStatusHistory)
      .find({
        where: { rideId },
        relations: { actorUser: true },
        order: { occurredAt: 'ASC', createdAt: 'ASC' },
      });

    return {
      rideId,
      items: history.map((item) => ({
        id: item.id,
        previousStatus: item.previousStatus,
        newStatus: item.newStatus,
        actorType: item.actorType,
        actor: {
          userId: item.actorUserId,
          phoneE164: item.actorUser?.phoneE164 ?? null,
        },
        metadata: item.metadata,
        occurredAt: item.occurredAt,
      })),
    };
  }

  async getLocations(
    rideId: string,
    query: AdminRideLocationQueryDto,
  ): Promise<AdminRideLocationListResponseDto> {
    await this.assertRideExists(rideId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const builder = this.dataSource
      .getRepository(RideLocationSample)
      .createQueryBuilder('sample')
      .where('sample.ride_id = :rideId', { rideId });

    if (query.recordedFrom) {
      builder.andWhere('sample.recorded_at >= :recordedFrom', {
        recordedFrom: new Date(query.recordedFrom),
      });
    }
    if (query.recordedTo) {
      builder.andWhere('sample.recorded_at <= :recordedTo', {
        recordedTo: new Date(query.recordedTo),
      });
    }
    if (query.acceptedForMetrics !== undefined) {
      builder.andWhere('sample.accepted_for_metrics = :acceptedForMetrics', {
        acceptedForMetrics: query.acceptedForMetrics,
      });
    }

    const [items, total] = await builder
      .orderBy('sample.recorded_at', 'DESC')
      .addOrderBy('sample.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      rideId,
      items: items.map((item) => ({
        id: item.id,
        latitude: item.latitude,
        longitude: item.longitude,
        accuracy: item.accuracy,
        heading: item.heading,
        speed: item.speed,
        acceptedForMetrics: item.acceptedForMetrics,
        rejectionReason: item.rejectionReason,
        distanceFromPreviousMeters: item.distanceFromPreviousMeters,
        cumulativeDistanceMeters: item.cumulativeDistanceMeters,
        recordedAt: item.recordedAt,
        receivedAt: item.receivedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      },
    };
  }

  private buildSummaryQuery(
    query: Partial<AdminRideQueryDto>,
    activeOnly: boolean,
  ): SelectQueryBuilder<Ride> {
    const builder = this.dataSource
      .getRepository(Ride)
      .createQueryBuilder('ride')
      .innerJoin('ride.passengerUser', 'passenger_user')
      .leftJoin(
        PassengerProfile,
        'passenger_profile',
        'passenger_profile.user_id = ride.passenger_user_id',
      )
      .leftJoin('ride.driverProfile', 'driver_profile')
      .leftJoin('driver_profile.user', 'driver_user')
      .leftJoin(
        DriverVehicle,
        'vehicle',
        'vehicle.driver_profile_id = driver_profile.id',
      )
      .innerJoin('ride.originZone', 'origin_zone')
      .innerJoin('ride.destinationZone', 'destination_zone')
      .leftJoin(
        DriverLocation,
        'driver_location',
        'driver_location.driver_profile_id = driver_profile.id',
      )
      .select([
        'ride.id AS "id"',
        'ride.status AS "status"',
        'ride.state_version AS "stateVersion"',
        'ride.passenger_user_id AS "passengerUserId"',
        'passenger_user.phone_e164 AS "passengerPhoneE164"',
        'passenger_profile.id AS "passengerProfileId"',
        'passenger_profile.first_name AS "passengerFirstName"',
        'passenger_profile.last_name AS "passengerLastName"',
        'passenger_profile.photo_url AS "passengerPhotoUrl"',
        'passenger_profile.photo_object_key AS "passengerPhotoObjectKey"',
        'passenger_profile.rating_average AS "passengerRatingAverage"',
        'driver_profile.id AS "driverProfileId"',
        'driver_profile.user_id AS "driverUserId"',
        'driver_user.phone_e164 AS "driverPhoneE164"',
        'driver_profile.first_name AS "driverFirstName"',
        'driver_profile.last_name AS "driverLastName"',
        'driver_profile.photo_url AS "driverPhotoUrl"',
        'driver_profile.photo_object_key AS "driverPhotoObjectKey"',
        'driver_profile.rating_average AS "driverRatingAverage"',
        'vehicle.id AS "vehicleId"',
        'vehicle.plate AS "vehiclePlate"',
        'vehicle.brand AS "vehicleBrand"',
        'vehicle.model AS "vehicleModel"',
        'vehicle.color AS "vehicleColor"',
        'vehicle.vehicle_type AS "vehicleType"',
        'origin_zone.id AS "originZoneId"',
        'origin_zone.code AS "originZoneCode"',
        'origin_zone.name AS "originZoneName"',
        'destination_zone.id AS "destinationZoneId"',
        'destination_zone.code AS "destinationZoneCode"',
        'destination_zone.name AS "destinationZoneName"',
        'ST_Y(ride.origin_position::geometry) AS "originLatitude"',
        'ST_X(ride.origin_position::geometry) AS "originLongitude"',
        'ride.origin_address AS "originAddress"',
        'ST_Y(ride.destination_position::geometry) AS "destinationLatitude"',
        'ST_X(ride.destination_position::geometry) AS "destinationLongitude"',
        'ride.destination_address AS "destinationAddress"',
        'ride.distance_meters AS "distanceMeters"',
        'ride.estimated_duration_seconds AS "estimatedDurationSeconds"',
        'ride.estimated_fare AS "estimatedFare"',
        'ride.final_fare AS "finalFare"',
        'ride.currency AS "currency"',
        'driver_location.latitude AS "driverLatitude"',
        'driver_location.longitude AS "driverLongitude"',
        'driver_location.accuracy AS "driverAccuracy"',
        'driver_location.heading AS "driverHeading"',
        'driver_location.speed AS "driverSpeed"',
        'driver_location.recorded_at AS "driverLocationRecordedAt"',
        'ride.requested_at AS "requestedAt"',
        'ride.driver_assigned_at AS "driverAssignedAt"',
        'ride.started_at AS "startedAt"',
        'ride.completed_at AS "completedAt"',
        'ride.cancelled_at AS "cancelledAt"',
        'ride.updated_at AS "updatedAt"',
      ])
      .addSelect(
        'EXISTS(SELECT 1 FROM ride_cancellations cancellation WHERE cancellation.ride_id = ride.id)',
        'hasCancellation',
      )
      .addSelect(
        `(SELECT COUNT(*)::int
          FROM ride_safety_incidents incident
          WHERE incident.ride_id = ride.id
            AND incident.status IN (:...openSafetyStatuses))`,
        'openSafetyIncidentCount',
      )
      .setParameter('openSafetyStatuses', OPEN_SAFETY_STATUSES);

    if (activeOnly) {
      builder.andWhere('ride.status IN (:...activeRideStatuses)', {
        activeRideStatuses: ACTIVE_RIDE_STATUSES,
      });
    } else if (query.status) {
      builder.andWhere('ride.status = :status', { status: query.status });
    }
    if (query.passengerUserId) {
      builder.andWhere('ride.passenger_user_id = :passengerUserId', {
        passengerUserId: query.passengerUserId,
      });
    }
    if (query.driverProfileId) {
      builder.andWhere('ride.driver_profile_id = :driverProfileId', {
        driverProfileId: query.driverProfileId,
      });
    }
    if (query.serviceZoneId) {
      builder.andWhere(
        '(ride.origin_zone_id = :serviceZoneId OR ride.destination_zone_id = :serviceZoneId)',
        { serviceZoneId: query.serviceZoneId },
      );
    }
    if (query.requestedFrom) {
      builder.andWhere('ride.requested_at >= :requestedFrom', {
        requestedFrom: new Date(query.requestedFrom),
      });
    }
    if (query.requestedTo) {
      builder.andWhere('ride.requested_at <= :requestedTo', {
        requestedTo: new Date(query.requestedTo),
      });
    }
    if (query.hasSafetyIncident === true) {
      builder.andWhere(
        'EXISTS(SELECT 1 FROM ride_safety_incidents filter_incident WHERE filter_incident.ride_id = ride.id)',
      );
    }
    if (query.hasSafetyIncident === false) {
      builder.andWhere(
        'NOT EXISTS(SELECT 1 FROM ride_safety_incidents filter_incident WHERE filter_incident.ride_id = ride.id)',
      );
    }
    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;
      builder.andWhere(
        `(
          ride.id::text ILIKE :search
          OR passenger_user.phone_e164 ILIKE :search
          OR CONCAT_WS(' ', passenger_profile.first_name, passenger_profile.last_name) ILIKE :search
          OR driver_user.phone_e164 ILIKE :search
          OR CONCAT_WS(' ', driver_profile.first_name, driver_profile.last_name) ILIKE :search
          OR vehicle.plate ILIKE :search
        )`,
        { search },
      );
    }

    return builder;
  }

  private mapSummary(raw: AdminRideSummaryRaw): AdminRideListItemDto {
    const hasDriver =
      raw.driverProfileId !== null &&
      raw.driverUserId !== null &&
      raw.driverPhoneE164 !== null &&
      raw.driverFirstName !== null &&
      raw.driverLastName !== null;
    const hasVehicle =
      raw.vehicleId !== null &&
      raw.vehiclePlate !== null &&
      raw.vehicleBrand !== null &&
      raw.vehicleModel !== null &&
      raw.vehicleColor !== null &&
      raw.vehicleType !== null;
    const hasLocation =
      raw.driverLatitude !== null &&
      raw.driverLongitude !== null &&
      raw.driverLocationRecordedAt !== null;

    return {
      id: raw.id,
      status: raw.status,
      stateVersion: Number(raw.stateVersion),
      passenger: {
        userId: raw.passengerUserId,
        phoneE164: raw.passengerPhoneE164,
        firstName: raw.passengerFirstName,
        lastName: raw.passengerLastName,
        photoUrl: this.avatarResolver.resolvePassengerAvatarUrl(
          raw.passengerProfileId
            ? {
                id: raw.passengerProfileId,
                photoObjectKey: raw.passengerPhotoObjectKey,
                photoUrl: raw.passengerPhotoUrl,
              }
            : null,
        ),
        ratingAverage: raw.passengerRatingAverage,
      },
      driver: hasDriver
        ? {
            profileId: raw.driverProfileId as string,
            userId: raw.driverUserId as string,
            phoneE164: raw.driverPhoneE164 as string,
            firstName: raw.driverFirstName as string,
            lastName: raw.driverLastName as string,
            photoUrl: this.avatarResolver.resolveDriverAvatarUrl({
              id: raw.driverProfileId as string,
              photoObjectKey: raw.driverPhotoObjectKey,
              photoUrl: raw.driverPhotoUrl,
            }),
            ratingAverage: raw.driverRatingAverage ?? '0.00',
          }
        : null,
      vehicle: hasVehicle
        ? {
            id: raw.vehicleId as string,
            plate: raw.vehiclePlate as string,
            brand: raw.vehicleBrand as string,
            model: raw.vehicleModel as string,
            color: raw.vehicleColor as string,
            vehicleType: raw.vehicleType as VehicleType,
          }
        : null,
      route: {
        origin: {
          latitude: Number(raw.originLatitude),
          longitude: Number(raw.originLongitude),
          address: raw.originAddress,
        },
        destination: {
          latitude: Number(raw.destinationLatitude),
          longitude: Number(raw.destinationLongitude),
          address: raw.destinationAddress,
        },
        originZone: {
          id: raw.originZoneId,
          code: raw.originZoneCode,
          name: raw.originZoneName,
        },
        destinationZone: {
          id: raw.destinationZoneId,
          code: raw.destinationZoneCode,
          name: raw.destinationZoneName,
        },
        estimatedDistanceMeters: Number(raw.distanceMeters),
        estimatedDurationSeconds: Number(raw.estimatedDurationSeconds),
      },
      fare: {
        estimatedFare: raw.estimatedFare,
        finalFare: raw.finalFare,
        currency: raw.currency,
      },
      currentDriverLocation: hasLocation
        ? {
            latitude: Number(raw.driverLatitude),
            longitude: Number(raw.driverLongitude),
            accuracy: this.nullableNumber(raw.driverAccuracy),
            heading: this.nullableNumber(raw.driverHeading),
            speed: this.nullableNumber(raw.driverSpeed),
            recordedAt: this.requiredDate(
              raw.driverLocationRecordedAt as Date | string,
            ),
          }
        : null,
      hasCancellation: this.boolean(raw.hasCancellation),
      openSafetyIncidentCount: Number(raw.openSafetyIncidentCount),
      requestedAt: this.requiredDate(raw.requestedAt),
      driverAssignedAt: this.nullableDate(raw.driverAssignedAt),
      startedAt: this.nullableDate(raw.startedAt),
      completedAt: this.nullableDate(raw.completedAt),
      cancelledAt: this.nullableDate(raw.cancelledAt),
      updatedAt: this.requiredDate(raw.updatedAt),
    };
  }

  private async assertRideExists(rideId: string): Promise<void> {
    const exists = await this.dataSource
      .getRepository(Ride)
      .existsBy({ id: rideId });
    if (!exists) {
      throw new NotFoundException('El viaje no existe');
    }
  }

  private nullableNumber(value: number | string | null): number | null {
    return value === null ? null : Number(value);
  }

  private nullableDate(value: Date | string | null): Date | null {
    return value === null ? null : new Date(value);
  }

  private requiredDate(value: Date | string): Date {
    return new Date(value);
  }

  private boolean(value: boolean | string | number): boolean {
    return value === true || value === 'true' || value === 1;
  }
}
