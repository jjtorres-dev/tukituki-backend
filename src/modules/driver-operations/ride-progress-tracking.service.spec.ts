import type { EntityManager } from 'typeorm';

import { RideLocationSample } from '../rides/entities/ride-location-sample.entity';
import { RideProgressMetrics } from '../rides/entities/ride-progress-metrics.entity';
import { Ride } from '../rides/entities/ride.entity';
import { RideLocationRejectionReason } from '../rides/enums/ride-location-rejection-reason.enum';
import { RideStatus } from '../rides/enums/ride-status.enum';
import { RideProgressTrackingService } from './ride-progress-tracking.service';

interface RepositoryMock<T extends object> {
  findOne: jest.Mock<Promise<T | null>, [unknown]>;
  create: jest.Mock<T, [Partial<T>]>;
  save: jest.Mock<Promise<T>, [T]>;
}

function repositoryMock<T extends object>(): RepositoryMock<T> {
  return {
    findOne: jest.fn<Promise<T | null>, [unknown]>(() => Promise.resolve(null)),
    create: jest.fn<T, [Partial<T>]>((value) => value as T),
    save: jest.fn<Promise<T>, [T]>((value) =>
      Promise.resolve({
        id:
          (value as { id?: string }).id ??
          'c7c97110-9c5b-4f12-9e95-1a9f8cb0598b',
        ...value,
      } as T),
    ),
  };
}

describe('RideProgressTrackingService', () => {
  const service = new RideProgressTrackingService();

  it('debe aceptar la primera muestra y crear métricas', async () => {
    const now = new Date();
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      driverProfileId: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
      status: RideStatus.IN_PROGRESS,
      stateVersion: 4,
      startedAt: new Date(now.getTime() - 10_000),
    } as Ride;
    const rideRepository = repositoryMock<Ride>();
    rideRepository.findOne.mockResolvedValue(ride);
    const metricsRepository = repositoryMock<RideProgressMetrics>();
    const sampleRepository = repositoryMock<RideLocationSample>();
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === RideProgressMetrics) return metricsRepository;
        if (entity === RideLocationSample) return sampleRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() => Promise.resolve([])),
    } as unknown as EntityManager;

    const result = await service.recordWithinTransaction(
      manager,
      ride.driverProfileId!,
      {
        latitude: -6.4877,
        longitude: -76.3599,
        accuracy: 8,
        recordedAt: now.toISOString(),
      },
      now,
    );

    expect(result?.acceptedForMetrics).toBe(true);
    expect(result?.trackedDistanceMeters).toBe(0);
    expect(sampleRepository.save).toHaveBeenCalledTimes(1);
    expect(metricsRepository.save).toHaveBeenCalled();
  });

  it('debe conservar una muestra antigua para auditoría sin facturarla', async () => {
    const now = new Date();
    const ride = {
      id: '3dbb6cbc-aee8-43f0-8247-e13d8e197b71',
      driverProfileId: '72b81eb5-c53f-4de2-bd9f-11f33d64da64',
      status: RideStatus.IN_PROGRESS,
      stateVersion: 4,
      startedAt: new Date(now.getTime() - 120_000),
    } as Ride;
    const metrics = {
      rideId: ride.id,
      acceptedSamples: 1,
      rejectedSamples: 0,
      trackedDistanceMeters: '250.00',
      startedAt: ride.startedAt,
      lastReceivedSampleAt: new Date(now.getTime() - 60_000),
      lastAcceptedSampleAt: new Date(now.getTime() - 60_000),
      lastAcceptedSampleId: null,
      calculatedDurationSeconds: 60,
    } as RideProgressMetrics;
    const rideRepository = repositoryMock<Ride>();
    rideRepository.findOne.mockResolvedValue(ride);
    const metricsRepository = repositoryMock<RideProgressMetrics>();
    metricsRepository.findOne.mockResolvedValue(metrics);
    const sampleRepository = repositoryMock<RideLocationSample>();
    const manager = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === RideProgressMetrics) return metricsRepository;
        if (entity === RideLocationSample) return sampleRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() => Promise.resolve([])),
    } as unknown as EntityManager;

    const result = await service.recordWithinTransaction(
      manager,
      ride.driverProfileId!,
      {
        latitude: -6.48,
        longitude: -76.36,
        accuracy: 8,
        recordedAt: new Date(now.getTime() - 90_000).toISOString(),
      },
      now,
    );

    expect(result?.acceptedForMetrics).toBe(false);
    expect(result?.rejectionReason).toBe(RideLocationRejectionReason.STALE);
    expect(result?.trackedDistanceMeters).toBe(250);
    expect(metrics.rejectedSamples).toBe(1);
  });
});
