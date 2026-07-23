import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

import { RideLocationSample } from '../rides/entities/ride-location-sample.entity';
import { RideProgressMetrics } from '../rides/entities/ride-progress-metrics.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideLocationRejectionReason } from '../rides/enums/ride-location-rejection-reason.enum';
import { RideStatus } from '../rides/enums/ride-status.enum';
import type { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import type { DriverLocation } from './entities/driver-location.entity';

const SAMPLE_MAX_AGE_MS = 45_000;
const SAMPLE_MAX_FUTURE_SKEW_MS = 10_000;
const SAMPLE_MAX_ACCURACY_METERS = 50;
const SAMPLE_MIN_INTERVAL_MS = 3_000;
const SAMPLE_MIN_MOVEMENT_METERS = 5;
const SAMPLE_MAX_SPEED_METERS_PER_SECOND = 30;

interface DistanceRow {
  distanceMeters: string | number | null;
}

export interface RideProgressUpdate {
  rideId: string;
  stateVersion: number;
  trackedDistanceMeters: number;
  durationSeconds: number;
  acceptedForMetrics: boolean;
  rejectionReason: RideLocationRejectionReason | null;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  recordedAt: Date;
}

@Injectable()
export class RideProgressTrackingService {
  async initializeWithinTransaction(
    manager: EntityManager,
    ride: Ride,
    startedAt: Date,
    initial?: {
      driverProfileId: string;
      location: DriverLocation;
    },
  ): Promise<RideProgressMetrics> {
    const repository = manager.getRepository(RideProgressMetrics);
    const existing = await repository.findOne({
      where: { rideId: ride.id },
      lock: { mode: 'pessimistic_write' },
    });

    if (existing) {
      return existing;
    }

    const metrics = await repository.save(
      repository.create({
        rideId: ride.id,
        acceptedSamples: 0,
        rejectedSamples: 0,
        trackedDistanceMeters: '0.00',
        startedAt,
        lastReceivedSampleAt: null,
        lastAcceptedSampleAt: null,
        lastAcceptedSampleId: null,
        calculatedDurationSeconds: 0,
      }),
    );

    if (!initial) {
      return metrics;
    }

    const sampleRepository = manager.getRepository(RideLocationSample);
    const baselineAccepted =
      initial.location.accuracy !== null &&
      initial.location.accuracy <= SAMPLE_MAX_ACCURACY_METERS;
    const baseline = await sampleRepository.save(
      sampleRepository.create({
        rideId: ride.id,
        driverProfileId: initial.driverProfileId,
        position: initial.location.position,
        latitude: initial.location.latitude,
        longitude: initial.location.longitude,
        accuracy: initial.location.accuracy,
        heading: initial.location.heading,
        speed: initial.location.speed,
        recordedAt: startedAt,
        receivedAt: startedAt,
        acceptedForMetrics: baselineAccepted,
        rejectionReason: baselineAccepted
          ? null
          : RideLocationRejectionReason.LOW_ACCURACY,
        distanceFromPreviousMeters: baselineAccepted ? '0.00' : null,
        cumulativeDistanceMeters: '0.00',
      }),
    );
    metrics.lastReceivedSampleAt = startedAt;

    if (baselineAccepted) {
      metrics.acceptedSamples = 1;
      metrics.lastAcceptedSampleAt = startedAt;
      metrics.lastAcceptedSampleId = baseline.id;
    } else {
      metrics.rejectedSamples = 1;
    }

    return repository.save(metrics);
  }

  async recordWithinTransaction(
    manager: EntityManager,
    driverProfileId: string,
    dto: UpdateDriverLocationDto,
    receivedAt: Date,
  ): Promise<RideProgressUpdate | null> {
    const ride = await manager.getRepository(Ride).findOne({
      where: {
        driverProfileId,
        status: RideStatus.IN_PROGRESS,
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!ride || !ride.startedAt) {
      return null;
    }

    const metrics = await this.initializeWithinTransaction(
      manager,
      ride,
      ride.startedAt,
    );
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : receivedAt;
    const sampleRepository = manager.getRepository(RideLocationSample);
    const previousAccepted = metrics.lastAcceptedSampleId
      ? await sampleRepository.findOne({
          where: { id: metrics.lastAcceptedSampleId },
          lock: { mode: 'pessimistic_read' },
        })
      : null;

    let rejectionReason = this.initialRejectionReason(
      metrics,
      dto,
      recordedAt,
      receivedAt,
    );
    let segmentDistance = 0;

    if (!rejectionReason && previousAccepted) {
      const intervalMs =
        recordedAt.getTime() - previousAccepted.recordedAt.getTime();

      if (intervalMs < SAMPLE_MIN_INTERVAL_MS) {
        rejectionReason = RideLocationRejectionReason.TOO_FREQUENT;
      } else {
        segmentDistance = await this.distanceFromSample(
          manager,
          previousAccepted.id,
          dto.longitude,
          dto.latitude,
        );

        if (segmentDistance < SAMPLE_MIN_MOVEMENT_METERS) {
          rejectionReason = RideLocationRejectionReason.MOVEMENT_TOO_SMALL;
        } else if (
          segmentDistance / (intervalMs / 1000) >
          SAMPLE_MAX_SPEED_METERS_PER_SECOND
        ) {
          rejectionReason = RideLocationRejectionReason.IMPOSSIBLE_SPEED;
        }
      }
    }

    const accepted = rejectionReason === null;
    const currentDistance = Number(metrics.trackedDistanceMeters);
    const cumulativeDistance = accepted
      ? currentDistance + segmentDistance
      : currentDistance;
    const sample = sampleRepository.create({
      rideId: ride.id,
      driverProfileId,
      position: {
        type: 'Point',
        coordinates: [dto.longitude, dto.latitude],
      },
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy ?? null,
      heading: dto.heading ?? null,
      speed: dto.speed ?? null,
      recordedAt,
      receivedAt,
      acceptedForMetrics: accepted,
      rejectionReason,
      distanceFromPreviousMeters: accepted ? segmentDistance.toFixed(2) : null,
      cumulativeDistanceMeters: cumulativeDistance.toFixed(2),
    });
    const savedSample = await sampleRepository.save(sample);

    if (
      metrics.lastReceivedSampleAt === null ||
      recordedAt.getTime() > metrics.lastReceivedSampleAt.getTime()
    ) {
      metrics.lastReceivedSampleAt = recordedAt;
    }

    if (accepted) {
      metrics.acceptedSamples += 1;
      metrics.trackedDistanceMeters = cumulativeDistance.toFixed(2);
      metrics.lastAcceptedSampleAt = recordedAt;
      metrics.lastAcceptedSampleId = savedSample.id;
    } else {
      metrics.rejectedSamples += 1;
    }

    metrics.calculatedDurationSeconds = Math.max(
      0,
      Math.floor((receivedAt.getTime() - ride.startedAt.getTime()) / 1000),
    );
    await manager.getRepository(RideProgressMetrics).save(metrics);

    return {
      rideId: ride.id,
      stateVersion: ride.stateVersion,
      trackedDistanceMeters: Math.round(Number(metrics.trackedDistanceMeters)),
      durationSeconds: metrics.calculatedDurationSeconds,
      acceptedForMetrics: accepted,
      rejectionReason,
      latitude: dto.latitude,
      longitude: dto.longitude,
      heading: dto.heading ?? null,
      speed: dto.speed ?? null,
      accuracy: dto.accuracy ?? null,
      recordedAt,
    };
  }

  private initialRejectionReason(
    metrics: RideProgressMetrics,
    dto: UpdateDriverLocationDto,
    recordedAt: Date,
    receivedAt: Date,
  ): RideLocationRejectionReason | null {
    if (!Number.isFinite(recordedAt.getTime())) {
      return RideLocationRejectionReason.OUT_OF_ORDER;
    }

    if (receivedAt.getTime() - recordedAt.getTime() > SAMPLE_MAX_AGE_MS) {
      return RideLocationRejectionReason.STALE;
    }

    if (
      recordedAt.getTime() - receivedAt.getTime() >
      SAMPLE_MAX_FUTURE_SKEW_MS
    ) {
      return RideLocationRejectionReason.FUTURE_TIMESTAMP;
    }

    if (
      dto.accuracy === undefined ||
      dto.accuracy > SAMPLE_MAX_ACCURACY_METERS
    ) {
      return RideLocationRejectionReason.LOW_ACCURACY;
    }

    if (
      metrics.lastReceivedSampleAt &&
      recordedAt.getTime() <= metrics.lastReceivedSampleAt.getTime()
    ) {
      return RideLocationRejectionReason.OUT_OF_ORDER;
    }

    if (
      dto.speed !== undefined &&
      dto.speed > SAMPLE_MAX_SPEED_METERS_PER_SECOND
    ) {
      return RideLocationRejectionReason.IMPOSSIBLE_SPEED;
    }

    return null;
  }

  private async distanceFromSample(
    manager: EntityManager,
    sampleId: string,
    longitude: number,
    latitude: number,
  ): Promise<number> {
    const queryResult: unknown = await manager.query(
      `SELECT ST_Distance(
         sample.position,
         ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
       ) AS "distanceMeters"
       FROM ride_location_samples sample
       WHERE sample.id = $1
       LIMIT 1`,
      [sampleId, longitude, latitude],
    );
    const rows = queryResult as DistanceRow[];
    const distance = Number(rows[0]?.distanceMeters);

    return Number.isFinite(distance) ? distance : 0;
  }
}
