import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';

import { DriverAvailabilityRedisService } from '../../infrastructure/redis/driver-availability-redis.service';
import { DriverLocation } from '../driver-operations/entities/driver-location.entity';
import { DriverOperationalState } from '../driver-operations/entities/driver-operational-state.entity';
import { DriverOperationalStatus } from '../driver-operations/enums/driver-operational-status.enum';
import { DriverProfile } from '../drivers/entities/driver-profile.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { RideOffer } from './entities/ride-offer.entity';
import { RideStatusHistory } from './entities/ride-status-history.entity';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './enums/ride-status.enum';
import { RideRealtimeService } from './realtime/ride-realtime.service';
import { RideTransitionsService } from './ride-transitions.service';

function queryBuilderReturning<T>(value: T) {
  const builder = {
    where: jest.fn(),
    setLock: jest.fn(),
    getOne: jest.fn(() => Promise.resolve(value)),
  };
  builder.where.mockReturnValue(builder);
  builder.setLock.mockReturnValue(builder);
  return builder;
}

describe('RideTransitionsService', () => {
  const driverUserId = 'f544d52a-39e0-4da3-8861-6010355c5dba';
  const passengerUserId = '2bb75614-f6d6-437f-b38f-e21aad622428';
  const driverProfileId = '72b81eb5-c53f-4de2-bd9f-11f33d64da64';
  const rideId = '3dbb6cbc-aee8-43f0-8247-e13d8e197b71';

  let ride: Ride;
  let state: DriverOperationalState;
  let location: DriverLocation;
  let savedHistory: RideStatusHistory | undefined;
  let distanceMeters: number;
  let service: RideTransitionsService;
  let realtimeService: {
    emitStatusChanged: jest.Mock;
    emitCancelled: jest.Mock;
  };
  let availabilityRedisService: {
    publishAvailableDriver: jest.Mock;
    removeDriverAvailability: jest.Mock;
  };

  beforeEach(() => {
    ride = {
      id: rideId,
      passengerUserId,
      driverProfileId,
      status: RideStatus.DRIVER_ASSIGNED,
      stateVersion: 1,
      driverAssignedAt: new Date(),
      driverArrivingAt: null,
      driverArrivedAt: null,
      arrivalDistanceMeters: null,
      searchExpiresAt: new Date(Date.now() + 60_000),
    } as Ride;
    state = {
      driverProfileId,
      status: DriverOperationalStatus.BUSY,
      lastSeenAt: new Date(),
      disconnectedAt: null,
    } as DriverOperationalState;
    location = {
      driverProfileId,
      latitude: -6.4877,
      longitude: -76.3599,
      accuracy: 8,
      recordedAt: new Date(),
    } as DriverLocation;
    distanceMeters = 80;
    savedHistory = undefined;

    const profile = {
      id: driverProfileId,
      userId: driverUserId,
      status: DriverStatus.APPROVED,
    } as DriverProfile;
    const passenger = {
      id: passengerUserId,
      roles: [UserRole.PASSENGER],
      status: UserStatus.ACTIVE,
      isPhoneVerified: true,
    } as User;

    const rideRepository = {
      findOne: jest.fn(() => Promise.resolve(ride)),
      save: jest.fn((entity: Ride) => Promise.resolve(entity)),
    };
    const stateRepository = {
      findOne: jest.fn(() => Promise.resolve(state)),
      save: jest.fn((entity: DriverOperationalState) =>
        Promise.resolve(entity),
      ),
    };
    const locationRepository = {
      findOne: jest.fn(() => Promise.resolve(location)),
    };
    const historyRepository = {
      create: jest.fn(
        (input: Partial<RideStatusHistory>) => input as RideStatusHistory,
      ),
      save: jest.fn((entity: RideStatusHistory) => {
        savedHistory = entity;
        return Promise.resolve(entity);
      }),
    };
    const offerRepository = {
      update: jest.fn(() => Promise.resolve({ affected: 1 })),
    };
    const userRepository = {
      findOne: jest.fn(() => Promise.resolve(passenger)),
    };
    const profileRepository = {
      createQueryBuilder: jest.fn(() => queryBuilderReturning(profile)),
    };

    const managerMock = {
      getRepository: jest.fn((entity: unknown): unknown => {
        if (entity === Ride) return rideRepository;
        if (entity === DriverProfile) return profileRepository;
        if (entity === DriverOperationalState) return stateRepository;
        if (entity === DriverLocation) return locationRepository;
        if (entity === RideStatusHistory) return historyRepository;
        if (entity === RideOffer) return offerRepository;
        if (entity === User) return userRepository;
        throw new Error('Repositorio inesperado');
      }),
      query: jest.fn(() =>
        Promise.resolve([{ distanceMeters: String(distanceMeters) }]),
      ),
    };
    const dataSourceMock = {
      transaction: jest.fn(
        <T>(work: (manager: EntityManager) => Promise<T>): Promise<T> =>
          work(managerMock as unknown as EntityManager),
      ),
      getRepository: jest.fn(() => ({
        findOne: jest.fn(() => Promise.resolve(null)),
        find: jest.fn(() => Promise.resolve([])),
      })),
    };

    realtimeService = {
      emitStatusChanged: jest.fn(),
      emitCancelled: jest.fn(),
    };
    availabilityRedisService = {
      publishAvailableDriver: jest.fn(() => Promise.resolve()),
      removeDriverAvailability: jest.fn(() => Promise.resolve()),
    };

    service = new RideTransitionsService(
      dataSourceMock as unknown as DataSource,
      availabilityRedisService as unknown as DriverAvailabilityRedisService,
      realtimeService as unknown as RideRealtimeService,
    );
  });

  it('debe cambiar DRIVER_ASSIGNED a DRIVER_ARRIVING y registrar historial', async () => {
    const result = await service.startArrival(driverUserId, rideId);

    expect(result.status).toBe(RideStatus.DRIVER_ARRIVING);
    expect(ride.driverArrivingAt).toBeInstanceOf(Date);
    expect(ride.stateVersion).toBe(2);
    expect(savedHistory?.previousStatus).toBe(RideStatus.DRIVER_ASSIGNED);
    expect(savedHistory?.newStatus).toBe(RideStatus.DRIVER_ARRIVING);
    expect(realtimeService.emitStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('debe registrar llegada cuando el conductor está dentro de 150 metros', async () => {
    ride.status = RideStatus.DRIVER_ARRIVING;

    const result = await service.markArrived(driverUserId, rideId);

    expect(result.status).toBe(RideStatus.DRIVER_ARRIVED);
    expect(result.arrivalDistanceMeters).toBe('80.00');
    expect(ride.driverArrivedAt).toBeInstanceOf(Date);
  });

  it('debe rechazar la llegada cuando el conductor está lejos', async () => {
    ride.status = RideStatus.DRIVER_ARRIVING;
    distanceMeters = 300;

    await expect(
      service.markArrived(driverUserId, rideId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe rechazar una ubicación GPS vencida', async () => {
    ride.status = RideStatus.DRIVER_ARRIVING;
    location.recordedAt = new Date(Date.now() - 60_000);

    await expect(
      service.markArrived(driverUserId, rideId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('debe cancelar un viaje asignado y liberar el conductor', async () => {
    const result = await service.cancelByPassenger(
      passengerUserId,
      rideId,
      'Ya no necesito el viaje',
    );

    expect(result.status).toBe(RideStatus.CANCELLED);
    expect(state.status).toBe(DriverOperationalStatus.AVAILABLE);
    expect(realtimeService.emitCancelled).toHaveBeenCalledTimes(1);
  });
});
